"""Create a local, reproducible-layout distribution; never install it."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

root = Path(__file__).resolve().parent.parent
files = {
    'plugin/Jellyfin.Plugin.Multiview.dll': root / 'server/bin/Release/net10.0/Jellyfin.Plugin.Multiview.dll',
    'dist/multiview.js': root / 'dist/multiview.js',
    'scripts/install-web.mjs': root / 'scripts/install-web.mjs',
    'README.md': root / 'README.md',
    'docs/PERFORMANCE.md': root / 'docs/PERFORMANCE.md',
    'docs/VALIDATION.md': root / 'docs/VALIDATION.md',
    'THIRD_PARTY_NOTICES.md': root / 'THIRD_PARTY_NOTICES.md',
    'HLS-LICENSE': root / 'node_modules/hls.js/LICENSE',
}
for path in files.values():
    if not path.is_file():
        raise SystemExit(f'Missing {path}; build the web bundle and DLL first.')
if files['plugin/Jellyfin.Plugin.Multiview.dll'].stat().st_mtime < files['dist/multiview.js'].stat().st_mtime:
    raise SystemExit('Web bundle is newer than DLL; rebuild the server project before packaging.')
output = root / 'artifacts/jellyfin-multiview-0.2.4.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for target, path in files.items():
        archive.write(path, target)
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{checksum}  {output.name}\n')
print(f'Created {output}')
