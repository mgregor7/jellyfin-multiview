import hashlib
import importlib.util
import json
import tempfile
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('serve_repository', ROOT / 'scripts/serve-repository.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        with ZipFile(ROOT / 'artifacts/jellyfin-multiview-local-repo.zip') as bundle:
            bundle.extractall(self.directory)

    def test_catalog_archive_and_binary_match_distribution(self):
        manifest = json.loads((self.directory / 'manifest.json').read_text())
        version = manifest[0]['versions'][0]
        payload = (self.directory / 'multiview_0.1.0.0.zip').read_bytes()
        self.assertEqual(hashlib.md5(payload).hexdigest(), version['checksum'])
        self.assertEqual(version['targetAbi'], '12.1.0.0')
        with ZipFile(BytesIO(payload)) as plugin, ZipFile(ROOT / 'artifacts/jellyfin-multiview-0.1.0.zip') as source:
            self.assertEqual(plugin.read('Jellyfin.Plugin.Multiview.dll'), source.read('plugin/Jellyfin.Plugin.Multiview.dll'))
            self.assertNotIn('plugin/Jellyfin.Plugin.Multiview.dll', plugin.namelist())

    def test_rebind_updates_zip_url_and_preserves_checksum(self):
        helper.configure(self.directory, 'http://192.168.1.20:9876')
        version = json.loads((self.directory / 'manifest.json').read_text())[0]['versions'][0]
        self.assertEqual(version['sourceUrl'], 'http://192.168.1.20:9876/multiview_0.1.0.0.zip')
        helper.configure(self.directory, 'http://127.0.0.1:8765')

    def test_corrupt_archive_is_rejected(self):
        (self.directory / 'multiview_0.1.0.0.zip').write_bytes(b'broken')
        with self.assertRaisesRegex(ValueError, 'Checksum mismatch'):
            helper.configure(self.directory, 'http://127.0.0.1:8765')

    def test_catalog_and_package_download_over_http(self):
        handler = partial(SimpleHTTPRequestHandler, directory=str(self.directory))
        with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
            base = f'http://127.0.0.1:{server.server_port}'
            helper.configure(self.directory, base)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with urlopen(base + '/manifest.json', timeout=5) as response:
                    version = json.load(response)[0]['versions'][0]
                with urlopen(version['sourceUrl'], timeout=5) as response:
                    payload = response.read()
                self.assertEqual(hashlib.md5(payload).hexdigest(), version['checksum'])
                with ZipFile(BytesIO(payload)) as plugin:
                    self.assertIsNone(plugin.testzip())
            finally:
                server.shutdown()
                thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
