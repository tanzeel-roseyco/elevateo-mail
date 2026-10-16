"""Bounded SDK resource-table fixtures; real artifact admission runs separately in fleet Docker."""
import unittest

from qa_resource_table import resource_bindings

# AIDEV-NOTE: The syntax follows AAPT2 PrintTable/FileReference; IDs match the retained decoded QA APK evidence.
TABLE = """Package name=com.elevateo.mail.qa id=7f
  type raw id=0f entryCount=1
    resource 0x7f0f0000 raw/elevateo_qa_ca
      () (file) res/raw/elevateo_qa_ca.pem
  type xml id=13 entryCount=2
    resource 0x7f130000 xml/elevateo_qa_network_security
      () (file) res/xml/elevateo_qa_network_security.xml type=XML
    resource 0x7f130001 xml/unrelated
      () (file) res/xml/unrelated.xml type=XML
"""


class ResourceTableTest(unittest.TestCase):
    def test_exact_default_files(self) -> None:
        self.assertEqual(resource_bindings(TABLE), {
            "raw/elevateo_qa_ca": "@ref/0x7f0f0000",
            "xml/elevateo_qa_network_security": "@ref/0x7f130000",
        })
        for old, new in [(".pem\n", ".pem\n      Flag disabled values:\n"),
                         (".xml type=XML\n", ".xml type=XML\n      Flag disabled values:\n")]:
            self.assertEqual(resource_bindings(TABLE.replace(old, new)), resource_bindings(TABLE))

    def test_generated_drawables_do_not_change_trust_binding_or_hide_duplicate_ids(self) -> None:
        generated = """  type drawable id=07 entryCount=1
    resource 0x7f070000 drawable/$avd_hide_password__0
      () (file) res/drawable/$avd_hide_password__0.xml type=XML
"""
        self.assertEqual(resource_bindings(TABLE + generated), resource_bindings(TABLE))
        with self.assertRaises(ValueError):
            resource_bindings(TABLE + generated.replace("0x7f070000", "0x7f0f0000"))
        with self.assertRaises(ValueError):
            resource_bindings(TABLE.replace("raw/elevateo_qa_ca\n", "raw/$elevateo_qa_ca\n"))

    def test_missing_wrong_package_type_id_name_path_and_alias(self) -> None:
        for old, new in [("com.elevateo.mail.qa", "com.elevateo.mail"),
                         ("raw/elevateo_qa_ca\n", "raw/wrong_ca\n"),
                         ("xml/elevateo_qa_network_security\n", "xml/wrong_policy\n"),
                         ("id=7f", "id=7e"), ("type raw id=0f", "type raw id=01"),
                         ("type raw", "type drawable"),
                         ("res/raw/elevateo_qa_ca.pem", "res/raw/other.pem"),
                         ("res/xml/elevateo_qa_network_security.xml", "res/xml/other.xml"),
                         ("(file) res/raw/elevateo_qa_ca.pem", "@0x7f0f0001"),
                         ("0x7f0f0000", "0x7e0f0000"),
                         ("raw/elevateo_qa_ca\n", "raw/elevateo_qa_ca PUBLIC\n")]:
            with self.subTest(new=new), self.assertRaises(ValueError):
                resource_bindings(TABLE.replace(old, new))

    def test_alternate_configuration_and_disabled_values_rejected(self) -> None:
        line = "      () (file) res/raw/elevateo_qa_ca.pem\n"
        variants = [line.replace("()", "(v24)"), line + line.replace("()", "(night)"), line + line,
                    line + "      Flag disabled values:\n      () (file) res/raw/other.pem\n",
                    line.replace("(file)", "(unknown)"), line + "      unsupported metadata\n"]
        for new in variants:
            with self.subTest(new=new), self.assertRaises(ValueError):
                resource_bindings(TABLE.replace(line, new))

    def test_duplicate_ids_entries_packages_and_empty_dump_rejected(self) -> None:
        resource = "    resource 0x7f0f0000 raw/elevateo_qa_ca\n      () (file) res/raw/elevateo_qa_ca.pem\n"
        for invalid in ["", "x", TABLE + TABLE, TABLE.replace(resource, resource + resource),
                        TABLE.replace("resource 0x7f130001", "resource 0x7f0f0000"),
                        TABLE.replace("Package name", "Package unknown"),
                        TABLE.replace("entryCount=1", "count=1"),
                        TABLE.replace("resource 0x7f0f0000", "resource nonsense"),
                        "x" * 8_000_001]:
            with self.subTest(length=len(invalid)), self.assertRaises(ValueError):
                resource_bindings(invalid)


if __name__ == "__main__":
    unittest.main()
