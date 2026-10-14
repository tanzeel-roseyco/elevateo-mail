# QA404 R17 diagnostic-unit repair


## Elara OFF404 R17 diagnostic-unit repair (source-only)
Based exact bc8a1a5a6d61a80e756f6078cd8d5fbec5957c6c in fresh owned elara-r17. R13 diagnostic unit observed 9 tests: 6 PASS, 3 AssertionError FAIL at source declarations21:1/35:1/76:1 (compiled19:1/33:1/72:1). These are unit failures, not GUI case evidence. Original private log inspected without exporting raw values/messages/stacks.
Source diagnosis: captureDiagnostic reads stack descriptor.value only; Node24 native accessor therefore loses coordinates. Framework-string reporter regression passed. Preserve synthetic fixture/original oracles; support only the exact intrinsic Error stack getter, reject arbitrary getters. Added native/data-stack/custom-getter regression; production path/message/coordinate bounds, strict allowlist and cleanup/body distinction unchanged.
All R17 runtime/lint/typecheck/build/Docker/browser NOT_RUN; Soren sole scheduler, frozen jobs unchanged. Independent functional and dedicated design review PENDING via root; no zero-defect or density claim. Observer OFF; BE02 unaccepted; BE03 CLOSED. R14/R15/R16 untouched; root sole vault writer. Requested Sol6.1 LOW/Fast/YOLO; effective identity/tier not independently audited.

Review packet counts and immutable blob receipts are provided in reports/elara-r17-diagnostic-unit-receipt.json. No app execution authorized or performed.
