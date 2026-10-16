"""真实 Chromium 冒烟：显式设置 PW_MODULE 与 CHROME 后运行，未设置则跳过。"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import functools
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
HTML = '''<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eee}.title{position:absolute;left:10px;top:10px;font:24px sans-serif}
.ui{position:absolute;left:180px;top:70px;width:100px;height:80px;background:COLOR}
</style><div class="title">Demo</div><div class="ui"></div><script>
window.__ready=true; window.__noDOM=false;
window.seek=async t=>{document.querySelector('.ui').style.opacity=window.__noDOM?'0.8':'1';};
HOOK
</script>'''


@unittest.skipUnless(os.environ.get('PW_MODULE') and os.environ.get('CHROME'), '真实浏览器测试需要 PW_MODULE 和 CHROME')
class BrowserSmoke(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='product-video-chromium-')
        self.root = Path(self.temp.name)
        (self.root / 'overlap.json').write_text(json.dumps({'text': '.title', 'ui': '.ui'}), encoding='utf-8')
        self.page('red')
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(self.root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}/film.html'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def page(self, color, hook=True):
        text = HTML.replace('COLOR', color).replace('HOOK', 'window.cornerCheck=()=>({n:1,flags:[]});' if hook else '')
        (self.root / 'film.html').write_text(text, encoding='utf-8')

    def render(self, name, *extra):
        rep = self.root / name
        result = subprocess.run(['node', str(SCRIPTS / 'frame_checks.mjs'), '--url', self.url,
            '--frames', '0:2', '--w', '320', '--h', '180', '--out', str(self.root / 'frames'),
            '--report', str(rep), '--revision', 'smoke-v1', '--overlap', str(self.root / 'overlap.json'), *extra],
            capture_output=True, text=True, timeout=60)
        return result, rep

    def summarize(self, rep, *extra):
        return subprocess.run(['python3', '-I', str(SCRIPTS / 'check_report.py'), str(rep),
            '--expect-frames', '0:2', *extra], capture_output=True, text=True)

    def test_real_render_refresh_resume_and_hash_binding(self):
        result, rep = self.render('first', '--corner')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.summarize(rep).returncode, 0)
        frame = self.root / 'frames/f_00000.png'
        before = frame.read_bytes()
        self.assertTrue(before.startswith(b'\x89PNG'))
        self.page('blue')
        result, rep = self.render('updated', '--corner')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotEqual(frame.read_bytes(), before)
        self.assertEqual(self.summarize(rep).returncode, 0)
        mtime = frame.stat().st_mtime_ns
        result, rep = self.render('resume', '--corner', '--resume')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(frame.stat().st_mtime_ns, mtime)
        self.assertEqual(self.summarize(rep).returncode, 0)
        frame.write_bytes(before)
        self.assertEqual(self.summarize(rep).returncode, 2)

    def test_real_missing_hook_fails(self):
        self.page('red', hook=False)
        result, rep = self.render('missing-hook', '--corner')
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(self.summarize(rep).returncode, 2)

    def test_real_handoff_requires_manual_review(self):
        result, rep = self.render('handoff', '--handoff', '0')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue((rep / 'handoff_0.png').is_file())
        self.assertEqual(self.summarize(rep).returncode, 2)


if __name__ == '__main__':
    unittest.main()
