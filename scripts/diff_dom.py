#!/usr/bin/env python3
"""比较同一块界面在两个状态下导出的 DOM（例如面板展开 / 收起），列出有变化的开标签。

做收起面板、打开抽屉这类状态切换时，产品往往还有联动（标题栏内边距变大、按钮换激活样式、阴影消失），
只改一个宽度去猜一定会漏。在真实产品里把两端各导出一次，用本脚本 diff，把变化的
width / padding / margin / opacity / box-shadow / class 全部纳入逐帧插值。

用法：python3 diff_dom.py <状态A.ts 或 .html> <状态B.ts 或 .html> [--max 40]
只用标准库。会忽略运行时生成的随机 id（React useId、拖拽库的 DndDescribedBy 等）造成的差异。
"""
import argparse
import difflib
import json
import re

RANDOM_ID = re.compile(r'(:r[0-9a-z]+:|\br[0-9a-z]{3,4}\b|DndDescribedBy-\d+|DndLiveRegion-\d+|radix-[\w:-]+|headlessui-[\w-]+-\d+)')


def load(path):
    text = open(path, encoding='utf-8').read()
    if path.endswith('.ts') or path.endswith('.js'):
        text = text[text.index('= ') + 2:].rstrip().rstrip(';')
        text = json.loads(text)
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--max', type=int, default=40, help='最多列出多少处差异')
    args = ap.parse_args()
    ta = re.findall(r'<[a-zA-Z][^>]*>', load(args.a))
    tb = re.findall(r'<[a-zA-Z][^>]*>', load(args.b))
    print(f'开标签数：A {len(ta)}，B {len(tb)}')
    norm = lambda tags: RANDOM_ID.sub('', ' '.join(tags))
    shown = 0
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, ta, tb, autojunk=False).get_opcodes():
        if op == 'equal' or norm(ta[i1:i2]) == norm(tb[j1:j2]):
            continue
        shown += 1
        if shown > args.max:
            print(f'…… 还有更多差异，用 --max 调大')
            break
        print(f'== {op}（A {i1}-{i2} / B {j1}-{j2}）')
        for t in ta[i1:i2][:3]:
            print('  -', t[:300])
        for t in tb[j1:j2][:3]:
            print('  +', t[:300])
    if shown == 0:
        print('没有结构或样式差异（随机 id 已忽略）')


if __name__ == '__main__':
    main()
