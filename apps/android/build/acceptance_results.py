"""Parse emulator evidence (uiautomator dumps, dumpsys output) into a JSON acceptance record.

Used by emulator-acceptance.sh. Statuses are PASS, FAIL and NOT_RUN; a NOT_RUN case always
carries the reason it could not be automated so the record never overstates coverage.
"""
from __future__ import annotations

import json
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from xml.etree import ElementTree as ET

STATUSES = ("PASS", "FAIL", "NOT_RUN")


@dataclass(frozen=True)
class CaseResult:
    name: str
    status: str
    detail: str

    def __post_init__(self) -> None:
        if self.status not in STATUSES:
            raise ValueError(f"unknown case status: {self.status}")
        if self.status == "NOT_RUN" and not self.detail.strip():
            raise ValueError("NOT_RUN cases must state why they were not automated")


def dump_contains_text(dump_xml: str, needle: str) -> bool:
    """True when any node's text or content-desc contains the needle (case-insensitive)."""
    try:
        root = ET.fromstring(dump_xml)
    except ET.ParseError as error:
        raise ValueError("malformed uiautomator dump") from error
    wanted = needle.casefold()
    for node in root.iter():
        for attribute in ("text", "content-desc"):
            value = node.get(attribute, "")
            if wanted in value.casefold():
                return True
    return False


def focused_package(dumpsys_output: str) -> str:
    """Extracts the resumed activity's package from `dumpsys activity activities`."""
    for line in dumpsys_output.splitlines():
        stripped = line.strip()
        # Format: mResumedActivity: ActivityRecord{... u0 com.example/.MainActivity t12}
        if stripped.startswith(("mResumedActivity:", "ResumedActivity:")):
            for token in stripped.split():
                if "/" in token:
                    return token.split("/", 1)[0]
    raise ValueError("no resumed activity in dumpsys output")


# Visible only in the signed-in shell (Shell.tsx header controls at phone width).
SIGNED_IN_MARKERS = ("Open navigation", "Account menu")
# The sign-in screen's primary action (SignInPage.tsx).
SIGNED_OUT_MARKERS = ("Continue with single sign-on",)


def signed_in_view(dump_xml: str) -> bool:
    """True only for the authenticated shell; the fixture notice alone (rendered over sign-in and
    error screens too) is not evidence of an authenticated view."""
    if any(dump_contains_text(dump_xml, marker) for marker in SIGNED_OUT_MARKERS):
        return False
    return all(dump_contains_text(dump_xml, marker) for marker in SIGNED_IN_MARKERS)


def classify_external_link(launch_ok: bool, package: str, focus: str | None) -> tuple[str, str]:
    """Status for the system-https-link case. PASS needs a successful VIEW launch AND a known
    foreground package other than the app; missing evidence is NOT_RUN, never PASS."""
    if not launch_ok:
        return "NOT_RUN", "the VIEW intent could not be launched; no evidence about link capture"
    if not focus:
        return "NOT_RUN", "foreground package could not be determined after the VIEW intent"
    if focus == package:
        return "FAIL", "the QA app captured a system https link"
    return "PASS", f"https VIEW intent resolved outside the app: {focus}"


def write_results(path: Path, cases: list[CaseResult], metadata: dict[str, str]) -> int:
    """Writes the JSON record; returns the process exit code (non-zero when any case failed)."""
    if not cases:
        raise ValueError("an acceptance record needs at least one case")
    summary = {status: sum(case.status == status for case in cases) for status in STATUSES}
    record = {"metadata": metadata, "summary": summary, "cases": [asdict(case) for case in cases]}
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return 1 if summary["FAIL"] else 0


def parse_case_lines(text: str) -> list[CaseResult]:
    """One case per non-empty line: NAME<TAB>STATUS<TAB>DETAIL (detail may contain tabs)."""
    cases: list[CaseResult] = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 2)
        if len(parts) != 3:
            raise ValueError(f"malformed case line: {line!r}")
        cases.append(CaseResult(name=parts[0], status=parts[1], detail=parts[2]))
    return cases


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    """CLI used by emulator-acceptance.sh.

    assert-text DUMP NEEDLE          exit 0 when the dump shows the text, 1 otherwise
    assert-signed-in DUMP            exit 0 when the dump shows the signed-in shell, 1 otherwise
    classify-external-link OK PKG FOCUS   prints STATUS<TAB>DETAIL (OK is 1 or 0; FOCUS may be empty)
    focused-package DUMPSYS          prints the resumed package
    write OUT CASES KEY=VALUE...     writes the JSON record; exit 1 when any case failed
    """
    if len(argv) == 4 and argv[1] == "assert-text":
        return 0 if dump_contains_text(_read(argv[2]), argv[3]) else 1
    if len(argv) == 3 and argv[1] == "assert-signed-in":
        return 0 if signed_in_view(_read(argv[2])) else 1
    if len(argv) == 5 and argv[1] == "classify-external-link":
        status, detail = classify_external_link(argv[2] == "1", argv[3], argv[4] or None)
        print(f"{status}\t{detail}")
        return 0
    if len(argv) == 3 and argv[1] == "focused-package":
        print(focused_package(_read(argv[2])))
        return 0
    if len(argv) >= 4 and argv[1] == "write":
        metadata: dict[str, str] = {}
        for pair in argv[4:]:
            key, separator, value = pair.partition("=")
            if not separator or not key:
                raise ValueError(f"metadata must be KEY=VALUE, got {pair!r}")
            metadata[key] = value
        return write_results(Path(argv[2]), parse_case_lines(_read(argv[3])), metadata)
    print(main.__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
