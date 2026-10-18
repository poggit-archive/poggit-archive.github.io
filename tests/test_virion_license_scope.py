import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from recover_virion_sources import license_details


class VirionLicenseScopeTest(unittest.TestCase):
    def test_sibling_project_notice_does_not_determine_the_license(self):
        files = [
            ("Selected/LICENSE", b"GNU GENERAL PUBLIC LICENSE"),
            ("Sibling/LICENSE", b"Permission is hereby granted, free of charge"),
        ]
        details = license_details(files, "Selected")
        self.assertEqual(details["license_display"], "GPL")
        self.assertEqual(details["license_files"], ["Selected/LICENSE"])

    def test_empty_project_notice_does_not_inherit_a_sibling_license(self):
        files = [
            ("Selected/LICENSE", b" \n"),
            ("Sibling/LICENSE", b"Permission is hereby granted, free of charge"),
        ]
        self.assertEqual(license_details(files, "Selected")["license_display"], "No License")

    def test_shared_root_notice_is_retained(self):
        details = license_details([("LICENSE", b"Apache License Version 2.0")], "Selected")
        self.assertEqual(details["license_display"], "Apache-2.0")
        self.assertEqual(details["license_files"], ["LICENSE"])


if __name__ == "__main__":
    unittest.main()
