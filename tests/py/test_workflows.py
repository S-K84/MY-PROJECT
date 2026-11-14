import glob, os, unittest
try:
    import yaml
except ImportError:
    yaml = None

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')


@unittest.skipIf(yaml is None, 'PyYAML tiada')
class T(unittest.TestCase):
    def test_semua_workflow_yaml_sah(self):
        # 14 Nov 2026: "run: \"x\" y" (petikan diikuti teks) tidak sah → GitHub gagalkan larian serta-merta tanpa log
        files = glob.glob(os.path.join(ROOT, '.github', 'workflows', '*.yml'))
        self.assertTrue(files)
        for f in files:
            with self.subTest(f=os.path.basename(f)):
                d = yaml.safe_load(open(f, encoding='utf-8'))
                self.assertIn('jobs', d)


if __name__ == '__main__':
    unittest.main()
