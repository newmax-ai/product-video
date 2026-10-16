#!/usr/bin/env python3
"""仅供本机程序化参考工程导出：不启动浏览器，只接收受限的固定尺寸 PNG 帧。
python3 serve_reference.py --project <工程> --out <新输出目录> [--port 4321]
"""
import argparse
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import struct
import threading
from urllib.parse import urlsplit, unquote


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--port', type=int, default=4321)
    args = parser.parse_args()
    project = Path(args.project).resolve()
    output = Path(args.out).resolve()
    if not (project / 'film.html').is_file() or not (project / 'film.mjs').is_file():
        parser.error('工程缺少 film.html / film.mjs')
    if not output.is_relative_to(project) or output == project:
        parser.error('输出必须是视频工程中的新子目录')
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        parser.error('输出目录非空；不会覆盖已有导出')
    output.mkdir(parents=True, exist_ok=True)
    session = secrets.token_urlsafe(32)
    config = {'frames': 360, 'fps': 30, 'width': 640, 'height': 360}
    lock = threading.Lock()
    manifest = {'kind': 'procedural-reference-only', 'status': 'running', **config, 'captured': {},
        'sources': {name: hashlib.sha256((project / name).read_bytes()).hexdigest()
                    for name in ['film.html', 'film.mjs', 'package-lock.json'] if (project / name).is_file()}}

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(project), **kw)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()

        def reply(self, status, value):
            data = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                return self.reply(403, {'error': '仅接受本机 Host'})
            route = urlsplit(self.path).path
            if route == '/__capture_config':
                return self.reply(200, {**config, 'session': session})
            if route == '/__capture_status':
                with lock:
                    return self.reply(200, {'status': manifest['status'], 'frames': len(manifest['captured']), 'expected': config['frames']})
            target = (project / unquote(route).lstrip('/')).resolve()
            if not target.is_relative_to(project) or target.is_relative_to(output) or any(p.startswith('.') for p in target.relative_to(project).parts):
                return self.reply(403, {'error': '路径不允许'})
            if target.is_dir():
                return self.reply(403, {'error': '不提供目录列表，请打开 /film.html'})
            return super().do_GET()

        def do_POST(self):
            origin = self.headers.get('Origin')
            allowed = {f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}
            if origin not in allowed or self.headers.get('X-Render-Session') != session:
                return self.reply(403, {'error': '来源或会话不匹配'})
            route = urlsplit(self.path).path
            try:
                if not route.startswith('/__frame/'):
                    raise ValueError('未知路径')
                frame = int(route.removeprefix('/__frame/'))
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 <= frame < config['frames'] or not 33 <= length <= 8 * 1024 * 1024:
                    raise ValueError('帧编号或大小无效')
                if self.headers.get('Content-Type') != 'image/png':
                    raise ValueError('仅接受 image/png')
                data = self.rfile.read(length)
                if len(data) != length or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
                    raise ValueError('PNG 头无效')
                if struct.unpack('>II', data[16:24]) != (config['width'], config['height']):
                    raise ValueError('PNG 尺寸不匹配')
            except ValueError as error:
                return self.reply(400, {'error': str(error)})
            digest = hashlib.sha256(data).hexdigest()
            with lock:
                key = str(frame)
                if key in manifest['captured'] and manifest['captured'][key] != digest:
                    return self.reply(409, {'error': '同编号帧内容变化，请使用新的导出目录'})
                target = output / f'f_{frame:05d}.png'
                temp = output / f'f_{frame:05d}.tmp'
                temp.write_bytes(data)
                temp.replace(target)
                manifest['captured'][key] = digest
                if len(manifest['captured']) == config['frames']:
                    manifest['status'] = 'complete'
                state = output / 'capture.json.tmp'
                state.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
                state.replace(output / 'capture.json')
            self.reply(200, {'frame': frame, 'sha256': digest})

        def log_message(self, format, *args):
            if self.command != 'POST':
                super().log_message(format, *args)

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'仅本机参考服务器：http://127.0.0.1:{server.server_port}/film.html', flush=True)
    print(f'固定 360 帧、640×360、30fps；输出 {output}；不自动启动浏览器。', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
