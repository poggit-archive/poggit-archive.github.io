import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location('media_recovery', Path(__file__).resolve().parents[1] / 'scripts/recover-media-followup.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class MediaPathRecoveryTest(unittest.TestCase):
    def test_ref_prefix_correction_keeps_the_image_path(self):
        self.assertEqual(recovery.match_entry(['.assets/Screenshot-1.png'], 'heads/main/.assets/Screenshot-1.png'), ('.assets/Screenshot-1.png', 'corrected_ref_prefix'))

    def test_case_mismatch_does_not_select_an_ambiguous_image(self):
        self.assertEqual(recovery.match_entry(['meta/Icon.PNG'], 'meta/icon.png'), ('meta/Icon.PNG', 'case_insensitive_path'))
        self.assertEqual(recovery.match_entry(['a/icon.png', 'b/icon.png'], 'icon.png'), (None, None))

    def test_error_html_is_not_accepted_as_image_bytes(self):
        self.assertFalse(recovery.image_bytes(b'<!doctype html><h1>404</h1>'))
        self.assertTrue(recovery.image_bytes(b'\x89PNG\r\n\x1a\n'))
