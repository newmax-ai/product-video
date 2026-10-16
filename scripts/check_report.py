#!/usr/bin/env python3
"""汇总单次运行的报告；0=通过，1=不通过，2=未完成，3=不适用。
最终验收指定 --expect-frames 起:止（止不含）；交接掩膜看过并记入 CRITIQUE.md 后才用 --handoff-reviewed。
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def integer(value, minimum=0):
    return type(value) is int and value >= minimum


def inspect(directory, expected=None, handoff_reviewed=False):
    files = sorted(Path(directory).glob('checks_*.json'))
    require(files, '没有本次运行的检查报告；后台启动成功不代表检查完成')
    reports = [json.loads(f.read_text(encoding='utf-8')) for f in files]
    first = reports[0]
    require(first.get('schemaVersion') == 3, '报告版本不受支持；需重跑以记录逐类采样与裁切验证状态')
    request = first['request']
    run_id = first['runId']
    require(isinstance(run_id, str) and run_id, '缺少运行标识')
    count = request['shards']
    require(integer(count, 1) and len(reports) == count, '分片数量不完整')
    checks = request['checks']
    require(type(checks['overlap']) is bool and type(checks['corner']) is bool, '检查配置无效')
    require(isinstance(checks['handoff'], list), '交接检查配置无效')
    if request['times'] is not None:
        require(expected is None, '抽样时间点不能冒充全片逐帧检查')
        ids = request['times']
        require(isinstance(ids, list) and ids and len(set(ids)) == len(ids), '抽样时间点为空或重复')
        require(all(type(t) in (int, float) and t >= 0 for t in ids), '抽样时间点无效')
        description = f'抽样 {len(ids)} 个时间点（不是全片验收）'
    else:
        start, stop = request['range']
        require(integer(start) and integer(stop) and stop > start, '预期帧区间无效')
        require(expected is None or list(expected) == [start, stop], '报告帧区间与要求的完整帧区间不一致')
        ids = list(range(start, stop))
        description = f'帧区间 [{start}, {stop})'
    require(count <= len(ids), '分片数超过采样数')
    seen = set()
    subjects = {'text': 0, 'ui': 0, 'decor': 0}
    source_samples = {'text': 0, 'ui': 0, 'decor': 0, 'uiRectsHook': 0}
    required_sources = request.get('overlapRequiredSources')
    if checks['overlap']:
        require(isinstance(required_sources, list) and all(key in source_samples for key in required_sources), '缺少或无效的逐来源检查配置')
        require(len(set(required_sources)) == len(required_sources), '必需来源重复')
    unverified_frames = []
    corner_samples = 0
    violations = 0
    handoff = {}
    for r in reports:
        require(r.get('schemaVersion') == 3 and r.get('runId') == run_id, '混入旧运行报告')
        require(r.get('request') == request and r.get('revision') == first.get('revision'), '分片参数或源版本不一致')
        require(r.get('status') == 'complete' and not r.get('errors'), f"分片 {r.get('shard')} 未完成或执行失败")
        k, n = map(int, r['shard'].split('/'))
        require(n == count and 0 <= k < count and k not in seen, '分片编号无效或重复')
        seen.add(k)
        wanted = [v for i, v in enumerate(ids) if (i if request['times'] is not None else v) % count == k]
        actual = r['frameIds']
        require(actual == wanted and r['frames'] == len(wanted), f'分片 {k} 丢帧、重复或覆盖不完整')
        if checks['overlap']:
            require(r['overlapChecks'] == len(wanted), f'分片 {k} 重叠检查未覆盖全部帧')
            for key in subjects:
                value = r['overlapSubjects'][key]
                require(integer(value), '重叠采样计数无效')
                subjects[key] += value
            for key in source_samples:
                value = r['overlapSourceSamples'][key]
                require(integer(value), f'{key} 采样计数无效')
                source_samples[key] += value
            require(isinstance(r['overlapUnverified'], dict), '缺少裁切未验证状态')
            unverified_frames.extend(r['overlapUnverified'])
        if checks['corner']:
            require(r['cornerChecks'] == len(wanted), f'分片 {k} 圆角检查未覆盖全部帧')
            samples = r['corner']['samples']
            require(integer(samples), '圆角采样计数无效')
            corner_samples += samples
        require(isinstance(r['overlap'], dict), '重叠结果无效')
        violations += len(r['overlap'])
        for kind in ('FRONTAL', 'COLOR'):
            value = r['corner']['cls'][kind]
            require(integer(value), '圆角错误计数无效')
            violations += value
        if request['capture']:
            outputs = r['outputs']
            require([o['id'] for o in outputs] == wanted, f'分片 {k} 输出图片不完整')
            for output in outputs:
                image = Path(output['path'])
                require(image.is_file(), f'缺少输出图片：{image}')
                with image.open('rb') as source:
                    digest = hashlib.file_digest(source, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else hashlib.sha256(source.read()).hexdigest()
                require(digest == output['sha256'], f'输出图片已改变，不能沿用报告：{image.name}')
        for time, value in r.get('handoff', {}).items():
            require(time not in handoff, '交接检查重复；只应由第 0 分片执行')
            handoff[time] = value
    if checks['overlap']:
        missing = [key for key in required_sources if source_samples[key] == 0]
        require(not missing, f'已配置的必需来源全程零可见采样：{", ".join(missing)}；核对选择器/钩子，确实可缺省时才在配置 optionalSources 中注明并记录理由')
        require(sum(value > 0 for value in subjects.values()) >= 2, '重叠检查未匹配足够的内容类别，请核对选择器或标为不适用')
        require(not unverified_frames, f'复杂裁切或变换的潜在重叠尚未验证，时间点：{", ".join(unverified_frames[:8])}；需精确检查或另行记录人工验收，不能当作自动通过')
    if checks['corner']:
        require(corner_samples > 0, '圆角检查零采样，不能当作通过')
    require({float(t) for t in handoff} == set(checks['handoff']), '交接检查缺失或混入额外时间点')
    print(f'运行 {run_id} · 分片 {count} · 检查 {description}')
    print(f'重叠采样 {subjects} · 圆角采样 {corner_samples} · 违规计数 {violations}')
    for time, result in handoff.items():
        print(f"交接 {time}s：变化像素 {result['changedPx']}，>40 的像素 {result['popPx']}，掩膜 {result['mask']}")
    if violations:
        print('结果：不通过')
        return 1
    if handoff and not handoff_reviewed:
        raise ValueError('交接掩膜仍需人工逐张查看并记录；自动差分不能证明对齐')
    if not checks['overlap'] and not checks['corner'] and not checks['handoff']:
        print('结果：不适用（只完成渲染，没有启用质量检查）')
        return 3
    print('结果：通过（仅限本次声明范围和启用项目，不代替视觉、声音及真实性验收）')
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('--expect-frames', help='最终成片的完整帧区间，例如 0:1200')
    parser.add_argument('--handoff-reviewed', action='store_true', help='已看过交接掩膜并在 CRITIQUE.md 记录，不自动核验此声明')
    args = parser.parse_args()
    try:
        expected = tuple(map(int, args.expect_frames.split(':'))) if args.expect_frames else None
        if expected is not None:
            require(len(expected) == 2, '--expect-frames 格式应为 起:止')
        return inspect(args.directory, expected, args.handoff_reviewed)
    except (OSError, ValueError, KeyError, TypeError, IndexError, AttributeError) as error:
        print(f'结果：未完成（{error}）')
        return 2


if __name__ == '__main__':
    sys.exit(main())
