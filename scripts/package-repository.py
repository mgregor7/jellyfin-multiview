"""Wrap the existing local distribution as an offline-transfer plugin repository."""
import hashlib
import json
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent


def build_repository():
    source = ROOT / 'artifacts/jellyfin-multiview-0.1.0.zip'
    plugin_name = 'multiview_0.1.0.0.zip'
    plugin_bytes = BytesIO()
    with ZipFile(source) as distribution:
        with ZipFile(plugin_bytes, 'w', ZIP_DEFLATED) as plugin:
            # Jellyfin extracts the archive directly into its plugin directory.
            plugin.writestr('Jellyfin.Plugin.Multiview.dll', distribution.read('plugin/Jellyfin.Plugin.Multiview.dll'))
            for name in ('THIRD_PARTY_NOTICES.md', 'HLS-LICENSE'):
                plugin.writestr(name, distribution.read(name))
        payload = plugin_bytes.getvalue()
        manifest = [{
            'guid': '9a08a8b3-3078-4b69-bc84-290ef5db4938',
            'name': 'Multiview',
            'overview': 'Multiple sports library streams in Jellyfin Web.',
            'description': 'Independent resizable video panes. Web script installation is also required; see INSTALL.md in the repository bundle.',
            'owner': 'Multiview',
            'category': 'General',
            'versions': [{
                'version': '0.1.0.0',
                'changelog': 'Initial local build. Web integration installed separately.',
                'targetAbi': '12.1.0.0',
                'sourceUrl': f'http://127.0.0.1:8765/{plugin_name}',
                'checksum': hashlib.md5(payload).hexdigest(),
                'timestamp': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
            }]
        }]
        output = ROOT / 'artifacts/jellyfin-multiview-local-repo.zip'
        with ZipFile(output, 'w', ZIP_DEFLATED) as bundle:
            bundle.writestr(plugin_name, payload)
            bundle.writestr('manifest.json', json.dumps(manifest, indent=2) + '\n')
            bundle.write(ROOT / 'scripts/serve-repository.py', 'serve-repository.py')
            bundle.write(ROOT / 'docs/LOCAL-REPOSITORY.md', 'INSTALL.md')
            for name in ('dist/multiview.js', 'scripts/install-web.mjs', 'THIRD_PARTY_NOTICES.md', 'HLS-LICENSE'):
                bundle.writestr(name, distribution.read(name))
    output.with_suffix('.zip.sha256').write_text(f'{hashlib.sha256(output.read_bytes()).hexdigest()}  {output.name}\n')
    print(f'Created {output}')
    return output


if __name__ == '__main__':
    build_repository()
