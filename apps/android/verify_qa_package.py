"""Validate decoded, packaged QA resources; never use this gate for release admission."""
from pathlib import Path
import sys
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from qa_resource_table import bound_reference, resource_bindings

ANDROID = "{http://schemas.android.com/apk/res/android}"
PACKAGE = "com.elevateo.mail.qa"
RECEIVER = PACKAGE + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def verify_manifest(manifest: str, bindings: dict[str, str]) -> None:
    root = ET.fromstring(manifest)
    require(root.tag == "manifest" and root.get("package") == PACKAGE, "wrong QA identity")
    apps = root.findall("application")
    require(len(apps) == 1, "expected one application")
    app = apps[0]
    for key, expected in {"debuggable": "true", "usesCleartextTraffic": "false"}.items():
        require(app.get(ANDROID + key) == expected, "unexpected application " + key)
    require(bound_reference(app.get(ANDROID + "networkSecurityConfig"),
                            "xml/elevateo_qa_network_security", bindings), "unbound network policy")
    permissions = [e.get(ANDROID + "name") for e in root if e.tag.startswith("uses-permission")]
    require(len(permissions) == 2 and set(permissions) == {"android.permission.INTERNET", RECEIVER},
            "unexpected QA permissions")
    declarations = root.findall("permission")
    require(len(declarations) == 1 and declarations[0].get(ANDROID + "name") == RECEIVER
            and declarations[0].get(ANDROID + "protectionLevel") in ("signature", "0x2"), "unsafe receiver permission")
    require(not any(e.get(ANDROID + "name") == "android.intent.action.VIEW"
                    for e in root.iter("action")), "unreviewed VIEW callback")


def verify_network(network: str, bindings: dict[str, str]) -> None:
    # AIDEV-NOTE: Compare the entire policy tree so extra trust domains/debug overrides cannot hide in valid XML.
    expected = ET.fromstring('''<network-security-config>
      <base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" />
      </trust-anchors></base-config><domain-config cleartextTrafficPermitted="false">
      <domain includeSubdomains="false">elevateo.qa.internal</domain><trust-anchors>
      <certificates src="@raw/elevateo_qa_ca" /></trust-anchors></domain-config></network-security-config>''')

    def same(left: ET.Element, right: ET.Element) -> bool:
        return (left.tag == right.tag and left.attrib == right.attrib
                and (left.text or "").strip() == (right.text or "").strip()
                and not (left.tail or "").strip() and len(left) == len(right)
                and all(same(a, b) for a, b in zip(left, right)))

    actual = ET.fromstring(network)
    for cert in actual.findall("domain-config/trust-anchors/certificates"):
        if bound_reference(cert.get("src"), "raw/elevateo_qa_ca", bindings):
            cert.set("src", "@raw/elevateo_qa_ca")
    require(same(actual, expected), "QA network trust policy differs")


def verify_ca(apk: Path, certificate: Path) -> None:
    expected = certificate.read_bytes()
    require(expected.startswith(b"-----BEGIN CERTIFICATE-----"), "public PEM certificate required")
    require(b"PRIVATE KEY" not in expected, "private key must never enter APK")
    with ZipFile(apk) as archive:
        names = [name for name in archive.namelist() if "elevateo_qa_ca" in name]
        require(names == ["res/raw/elevateo_qa_ca.pem"], "unexpected packaged CA path/count")
        require(archive.read(names[0]) == expected, "packaged CA does not match fixture CA")


if __name__ == "__main__":
    if len(sys.argv) != 6:
        raise SystemExit("usage: verify_qa_package.py MANIFEST_XML NETWORK_XML APK PUBLIC_CA RESOURCE_TABLE")
    bindings = resource_bindings(Path(sys.argv[5]).read_text(encoding="utf-8"))
    verify_manifest(Path(sys.argv[1]).read_text(encoding="utf-8"), bindings)
    verify_network(Path(sys.argv[2]).read_text(encoding="utf-8"), bindings)
    verify_ca(Path(sys.argv[3]), Path(sys.argv[4]))
    print("isolated QA packaged identity, permissions, trust and CA PASS")
