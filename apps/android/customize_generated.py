"""Apply reviewed native behaviour to the disposable Tauri Android project."""
from pathlib import Path
import re
import sys
from xml.etree import ElementTree as ET

ANDROID = "{http://schemas.android.com/apk/res/android}"
NETWORK_STATE = "android.permission.ACCESS_NETWORK_STATE"
PACKAGES = {"com.elevateo.mail", "com.elevateo.mail.fixture", "com.elevateo.mail.qa"}
GENERATED_BODY = """import android.os.Bundle
import androidx.activity.enableEdgeToEdge
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}"""


def normalize(source: str) -> str:
    return "\n".join(line.strip() for line in source.splitlines() if line.strip())


def customize(project: Path) -> None:
    main = project / "app/src/main"
    manifest = main / "AndroidManifest.xml"
    activities = list((main / "java").rglob("MainActivity.kt"))
    if len(activities) != 1:
        raise ValueError("Expected one generated MainActivity")
    activity = activities[0]
    # AIDEV-NOTE: Never follow generated symlinks to edit files outside the disposable build context.
    for path in (manifest, activity):
        if not path.is_file() or path.absolute() != path.resolve():
            raise ValueError("Generated inputs must be regular files without symlink ancestors")
    source = activity.read_text(encoding="utf-8")
    match = re.fullmatch(r"package ([a-z.]+)\s+(.*)", source.strip(), re.DOTALL)
    if not match or match[1] not in PACKAGES:
        raise ValueError("Unexpected generated package")
    template = Path(__file__).with_name("MainActivity.kt.in").read_text(encoding="utf-8")
    replacement = template.replace("@PACKAGE@", match[1])
    if normalize(match[2]) != normalize(GENERATED_BODY) and normalize(source) != normalize(replacement):
        raise ValueError("Generated activity differs from reviewed Tauri CLI 2.12.2 template")
    tree = ET.parse(manifest)
    root = tree.getroot()
    targets = root.findall("application/activity")
    if root.tag != "manifest" or len(targets) != 1 or targets[0].get(ANDROID + "name") != ".MainActivity":
        raise ValueError("Unexpected generated activity declaration")
    uses = [node for node in root if node.tag.startswith("uses-permission")
            and node.get(ANDROID + "name") == NETWORK_STATE]
    if len(uses) > 1 or (uses and (uses[0].tag != "uses-permission"
                                   or uses[0].attrib != {ANDROID + "name": NETWORK_STATE})):
        raise ValueError("Network-state permission must be unconditional and unique")
    if targets[0].get(ANDROID + "windowSoftInputMode") not in (None, "adjustResize"):
        raise ValueError("Unexpected keyboard resize mode")
    if not uses:
        root.insert(0, ET.Element("uses-permission", {ANDROID + "name": NETWORK_STATE}))
    targets[0].set(ANDROID + "windowSoftInputMode", "adjustResize")
    # AIDEV-NOTE: The phone/tablet shell has no TV navigation; Tauri's default TV launcher must not advertise it.
    for feature in root.findall("uses-feature"):
        if feature.get(ANDROID + "name") == "android.software.leanback":
            root.remove(feature)
    for intent in targets[0].findall("intent-filter"):
        for category in intent.findall("category"):
            if category.get(ANDROID + "name") == "android.intent.category.LEANBACK_LAUNCHER":
                intent.remove(category)
    ET.register_namespace("android", ANDROID[1:-1])
    activity.write_text(replacement, encoding="utf-8")
    tree.write(manifest, encoding="unicode", xml_declaration=True)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: customize_generated.py GENERATED_ANDROID_PROJECT")
    customize(Path(sys.argv[1]))
