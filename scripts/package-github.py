"""Prepare release assets and a Jellyfin manifest for a public GitHub repository."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]


def prepare(repository, source, output):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Repository must be OWNER/NAME.')
    with ZipFile(source) as bundle:
        manifest = json.loads(bundle.read('manifest.json'))
        for package in manifest:
            package['owner'] = repository.split('/')[0]
            package['description'] = ('Independent resizable video panes for Jellyfin Web. '
                                      'The web script must also be installed; see the repository README.')
            for version in package['versions']:
                number = version['version']
                if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', number):
                    raise ValueError('Expected a four-part plugin version.')
                filename = f'multiview_{number}.zip'
                payload = bundle.read(filename)
                if hashlib.md5(payload).hexdigest() != version['checksum'].lower():
                    raise ValueError('Input plugin ZIP checksum does not match the manifest.')
                version['sourceUrl'] = f'https://github.com/{repository}/releases/download/v{number}/{filename}'
                output.mkdir(parents=True, exist_ok=True)
                (output / filename).write_bytes(payload)
        (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', required=True, help='Public GitHub OWNER/NAME')
    parser.add_argument('--source', type=Path, default=ROOT / 'artifacts/jellyfin-multiview-local-repo.zip')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/github-release')
    args = parser.parse_args()
    prepare(args.repository, args.source, args.output)
    print(f'Prepared {args.output}')
    print(f'After publishing: https://github.com/{args.repository}/releases/latest/download/manifest.json')


if __name__ == '__main__':
    main()
