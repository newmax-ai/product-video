"""参考帧接收服务测试：本机 HTTP，使用合成 PNG，不启动浏览器。"""
import binascii
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zlib

SCRIPT = Path(__file__).resolve().parents[1] / 'serve_reference.py'


def png(width=640, height=360, color=0):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', binascii.crc32(kind + data) & 0xffffffff)
    raw = (b'\x00' + bytes([color, color, color]) * width) * height
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')


class ReferenceServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='video-server-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'film.html').write_text('参考测试')
        (self.root / 'film.mjs').write_text('// 测试')
        self.proc = subprocess.Popen(['python3', '-I', '-B', str(SCRIPT), '--project', str(self.root), '--out', str(self.root / 'capture'), '--port', '0'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(self.stop)
        line = self.proc.stdout.readline()
        match = re.search(r'(http://127\.0\.0\.1:\d+)/film.html', line)
        self.assertIsNotNone(match, line)
        self.url = match.group(1)
        status, data = self.request('/__capture_config')
        self.assertEqual(status, 200)
        self.session = data['session']

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            self.proc.wait(timeout=5)
        self.proc.stdout.close()
        self.proc.stderr.close()

    def request(self, route, data=None, headers=None):
        req = Request(self.url + route, data=data, headers=headers or {})
        try:
            with urlopen(req, timeout=5) as r:
                body = r.read()
                return r.status, json.loads(body) if 'json' in r.headers.get('Content-Type', '') else body
        except HTTPError as error:
            body = error.read()
            error.close()
            return error.code, json.loads(body)

    def headers(self):
        return {'Origin': self.url, 'X-Render-Session': self.session, 'Content-Type': 'image/png'}

    def test_accepts_frame_and_same_content_retry(self):
        data = png()
        for _ in range(2):
            status, _ = self.request('/__frame/0', data, self.headers())
            self.assertEqual(status, 200)
        manifest = json.loads((self.root / 'capture/capture.json').read_text())
        self.assertEqual(manifest['status'], 'running')
        self.assertEqual(len(manifest['captured']), 1)

    def test_changed_frame_is_not_overwritten(self):
        self.assertEqual(self.request('/__frame/0', png(), self.headers())[0], 200)
        self.assertEqual(self.request('/__frame/0', png(color=255), self.headers())[0], 409)
        self.assertEqual((self.root / 'capture/f_00000.png').read_bytes(), png())

    def test_missing_session_or_foreign_origin_rejected(self):
        self.assertEqual(self.request('/__frame/0', png(), {'Content-Type': 'image/png'})[0], 403)
        headers = self.headers(); headers['Origin'] = 'https://example.invalid'
        self.assertEqual(self.request('/__frame/0', png(), headers)[0], 403)

    def test_invalid_frame_or_size_rejected(self):
        self.assertEqual(self.request('/__frame/360', png(), self.headers())[0], 400)
        self.assertEqual(self.request('/__frame/0', png(width=100), self.headers())[0], 400)
        self.assertEqual(self.request('/__frame/0', b'not-an-image' * 5, self.headers())[0], 400)

    def test_output_and_parent_paths_are_not_served(self):
        self.assertEqual(self.request('/capture')[0], 403)
        self.assertEqual(self.request('/%2e%2e/private.txt')[0], 403)

    def test_nonempty_output_is_preserved(self):
        output = self.root / 'existing'; output.mkdir(); (output / 'keep').write_text('保留')
        r = subprocess.run(['python3', '-I', '-B', str(SCRIPT), '--project', str(self.root), '--out', str(output), '--port', '0'], capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual((output / 'keep').read_text(), '保留')


if __name__ == '__main__':
    unittest.main()
