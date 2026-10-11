import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_github', ROOT / 'scripts/package-github.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GithubPackageTests(unittest.TestCase):
    def test_public_urls_point_to_exact_version_and_checksum(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            module.prepare('example/multiview', ROOT / 'artifacts/jellyfin-multiview-local-repo.zip', output)
            version = json.loads((output / 'manifest.json').read_text())[0]['versions'][0]
            self.assertEqual(version['sourceUrl'], 'https://github.com/example/multiview/releases/download/v0.2.5.0/multiview_0.2.5.0.zip')
            self.assertEqual(hashlib.md5((output / 'multiview_0.2.5.0.zip').read_bytes()).hexdigest(), version['checksum'])
            self.assertEqual(version['targetAbi'], '12.1.0.0')

    def test_invalid_repository_rejected(self):
        with self.assertRaises(ValueError):
            module.prepare('https://github.com/example/repo', Path('missing'), Path('unused'))


if __name__ == '__main__':
    unittest.main()
