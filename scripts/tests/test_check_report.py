"""报告单测，不启动浏览器：python3 -I -B -m unittest discover -s scripts/tests -p 'test_check_report.py'。"""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'check_report.py'


def report(shard=0, count=2):
    ids = list(range(shard, 4, count))
    return {
        'schemaVersion': 3, 'runId': 'test-run', 'revision': 'source-v1',
        'request': {'url': 'http://localhost/film.html', 'range': [0, 4], 'times': None,
                    'fps': 30, 'width': 1920, 'height': 1080, 'shards': count,
                    'overlapRequiredSources': ['text', 'ui'],
                    'capture': False, 'checks': {'overlap': True, 'corner': False, 'handoff': []}},
        'shard': f'{shard}/{count}', 'status': 'complete', 'frames': len(ids), 'frameIds': ids,
        'overlapChecks': len(ids), 'overlapSubjects': {'text': 2, 'ui': 2, 'decor': 0},
        'overlapSourceSamples': {'text': 2, 'ui': 2, 'decor': 0, 'uiRectsHook': 0}, 'overlapUnverified': {},
        'overlap': {}, 'cornerChecks': 0,
        'corner': {'samples': 0, 'cls': {'FRONTAL': 0, 'COLOR': 0, 'edge': 0}, 'flagged': {}},
        'handoff': {}, 'errors': [], 'outputs': [],
    }


class ReportTests(unittest.TestCase):
    def run_reports(self, reports, extra=(), setup=None):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            if setup:
                setup(root, reports)
            for i, value in enumerate(reports):
                (root / f'checks_{i}.json').write_text(json.dumps(value), encoding='utf-8')
            return subprocess.run(['python3', '-I', str(SCRIPT), d, *extra], capture_output=True, text=True)

    def assert_incomplete(self, reports, extra=(), setup=None):
        r = self.run_reports(reports, extra, setup)
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertIn('未完成', r.stdout)

    def test_empty_directory_is_not_pass(self):
        self.assert_incomplete([])

    def test_complete_run_passes(self):
        r = self.run_reports([report(0), report(1)], ['--expect-frames', '0:4'])
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('通过', r.stdout)

    def test_missing_shard(self):
        self.assert_incomplete([report(0)])

    def test_running_or_failed_shard(self):
        for state in ['running', 'failed']:
            a, b = report(0), report(1)
            b['status'] = state
            self.assert_incomplete([a, b])

    def test_mixed_run_or_revision(self):
        for key in ['runId', 'revision']:
            a, b = report(0), report(1)
            b[key] = 'other'
            self.assert_incomplete([a, b])

    def test_missing_or_duplicate_frames(self):
        for ids in [[1], [1, 1]]:
            a, b = report(0), report(1)
            b['frameIds'] = ids
            b['frames'] = len(ids)
            self.assert_incomplete([a, b])

    def test_wrong_expected_range(self):
        self.assert_incomplete([report(0), report(1)], ['--expect-frames', '0:120'])

    def test_checks_not_executed(self):
        a, b = report(0), report(1)
        b['overlapChecks'] = 0
        self.assert_incomplete([a, b])

    def test_unmatched_selectors(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['overlapSubjects'] = {'text': 0, 'ui': 0, 'decor': 0}
        self.assert_incomplete(reports)

    def test_each_configured_source_must_be_sampled(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['overlapRequiredSources'] = ['text', 'ui', 'decor']
            r['overlapSourceSamples'] = {'text': 2, 'ui': 2, 'decor': 0, 'uiRectsHook': 0}
        self.assert_incomplete(reports)

    def test_projection_hook_cannot_hide_behind_dom_ui(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['overlapRequiredSources'] = ['text', 'ui', 'uiRectsHook']
            r['overlapSourceSamples'] = {'text': 2, 'ui': 2, 'decor': 0, 'uiRectsHook': 0}
        self.assert_incomplete(reports)

    def test_unsupported_clipping_is_not_pass(self):
        reports = [report(0), report(1)]
        reports[0]['overlapUnverified'] = {'0.000000': [{'reasons': ['复杂 clip-path']}]}
        self.assert_incomplete(reports)

    def test_optional_source_can_be_absent(self):
        reports = [report(0), report(1)]
        # decor 已被配置阶段排除出必需来源；其零采样不妨碍 text/UI 检查。
        for r in reports:
            r['request']['overlapRequiredSources'] = ['text', 'ui']
        result = self.run_reports(reports)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_required_sources_can_appear_in_different_shards(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['overlapRequiredSources'] = ['text', 'ui', 'decor']
        reports[1]['overlapSourceSamples']['decor'] = 1
        result = self.run_reports(reports)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_old_schema_cannot_claim_new_coverage(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['schemaVersion'] = 2
        self.assert_incomplete(reports)

    def test_corner_no_samples(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['checks']['corner'] = True
            r['cornerChecks'] = r['frames']
        self.assert_incomplete(reports)

    def test_violations_fail(self):
        a, b = report(0), report(1)
        b['overlap'] = {'0.033': [{'kind': 'text×ui'}]}
        r = self.run_reports([a, b])
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn('不通过', r.stdout)

    def test_no_checks_is_not_applicable(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['checks']['overlap'] = False
        result = self.run_reports(reports)
        self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
        self.assertIn('不适用', result.stdout)

    def test_handoff_needs_manual_review(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['checks']['handoff'] = [0.1]
            r['handoff'] = {'0.1': {'changedPx': 0, 'meanDiffOfChanged': 0, 'popPx': 0, 'mask': 'mask.png'}}
        self.assert_incomplete(reports)

    def test_reviewed_handoff_can_pass(self):
        reports = [report(0), report(1)]
        for r in reports:
            r['request']['checks']['handoff'] = [0.1]
        reports[0]['handoff'] = {'0.1': {'changedPx': 0, 'popPx': 0, 'mask': 'mask.png'}}
        result = self.run_reports(reports, ['--handoff-reviewed'])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_corrupt_report(self):
        self.assert_incomplete([{'frames': 1}])

    def test_image_hash_binds_report_to_output(self):
        def setup(root, reports):
            for r in reports:
                r['request']['capture'] = True
                for i in r['frameIds']:
                    path = root / f'f_{i:05}.png'
                    path.write_bytes(b'frame')
                    r['outputs'].append({'id': i, 'path': str(path), 'sha256': hashlib.sha256(b'frame').hexdigest()})
        reports = [report(0), report(1)]
        result = self.run_reports(copy.deepcopy(reports), setup=setup)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        def tamper(root, reports):
            setup(root, reports)
            (root / 'f_00000.png').write_bytes(b'old-frame')
        self.assert_incomplete(copy.deepcopy(reports), setup=tamper)


if __name__ == '__main__':
    unittest.main()
