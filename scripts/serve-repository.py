"""Serve a copied Multiview repository. Requires only Python 3.9+."""
import argparse
import functools
import hashlib
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def configure(directory, base_url):
    parsed = urlsplit(base_url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('Base URL must be an HTTP(S) address without credentials, query or fragment.')
    manifest_path = directory / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    for package in manifest:
        for version in package['versions']:
            filename = Path(urlsplit(version['sourceUrl']).path).name
            archive = directory / filename
            if not filename.endswith('.zip') or not archive.is_file():
                raise ValueError(f'Missing plugin archive: {filename}')
            if hashlib.md5(archive.read_bytes()).hexdigest().lower() != version['checksum'].lower():
                raise ValueError(f'Checksum mismatch: {filename}. Rebuild the repository package.')
            version['sourceUrl'] = base_url.rstrip('/') + '/' + filename
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--bind', default='127.0.0.1', help='Listen address; default is loopback only')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--base-url', help='Address reachable FROM Jellyfin, e.g. http://192.168.1.20:8765')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535.')
    if args.bind != '127.0.0.1' and not args.base_url:
        parser.error('--base-url is required when changing --bind.')
    base = args.base_url or f'http://127.0.0.1:{args.port}'
    directory = args.directory.resolve()
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(directory))
    try:
        with ThreadingHTTPServer((args.bind, args.port), handler) as server:
            configure(directory, base)
            print(f'Jellyfin repository URL: {base.rstrip("/")}/manifest.json', flush=True)
            print('Leave this process running while Jellyfin installs/checks updates. Ctrl+C stops it.', flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f'Repository error: {error}\n')


if __name__ == '__main__':
    main()
