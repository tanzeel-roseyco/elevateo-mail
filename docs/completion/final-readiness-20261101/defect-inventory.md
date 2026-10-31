# Unique final-readiness defects

This inventory deduplicates overlapping reviews and rereviews. Runtime results are in the client receipts; a review finding alone is not a passing test. Scope is this November 1 work, not the historical October 30 inventory.

## Application: 15

1. Windows API accepted mismatched session context/version.
2. Corrupted UTF-8 message bytes were replacement-decoded.
3. Lost draft acknowledgement retried with a different operation ID.
4. Saved status incorrectly described newer unsaved edits.
5. Expired authentication callback could revive after clock rewind.
6. Token exchange buffered unbounded responses.
7. Assistant runtime switch retained the previous provider's session.
8. Cancelled session bootstrap retained credentials.
9. Initial conversation failure offered no retry.
10. Obsolete connection-list response overwrote refreshed state.
11. Connection grant selection exceeded the 50-mailbox contract maximum.
12. Connector instructions advertised unpublished installation and confused credentials.
13. Suppression search input diverged from URL navigation.
14. Thread status wrappers produced invalid block-in-paragraph nesting.
15. Dark reader metadata and notes had insufficient text contrast; note cards lacked a dark surface.

## Packaging/build: 4

1. Installer manifest enumeration failures were hidden.
2. Persistent publish output included obsolete release files.
3. Android APK entrypoint overrode caller resource limits.
4. Generated Android manifest advertised unsupported TV launching, failing Android lint.

## Verification: 22

1. Missing-items fixture had another invalid field, masking validation.
2. Oversized token-response test used invalid JSON and a generic failure assertion.
3. Thread-detail fixtures omitted required fields, masking validation.
4. Mailbox-limit tests timed out through repeated layout/render passes.
5. Swift image reference was mutable.
6. Production preview lacked readiness/liveness checks.
7. Readiness HTTP calls lacked a bounded timeout.
8. Native harness mounted generated-schema output read-only.
9. Swift API tests lacked Linux FoundationNetworking.
10. Browser thread fixtures omitted required folder/snooze/star fields (two builders, one underlying defect).
11. Production browser used an obsolete combined sender/subject locator.
12. Swift-only image wrapper invoked unavailable Python.
13. Native wrapper did not fail on unsuccessful directory changes.
14. Contrast probe rejected valid OKLCH colors.
15. Sign-in scenarios omitted the public SSO-status fixture.
16. Unread navigation selector was ambiguous.
17. Sign-out oracle tested nonexistent visible text and could pass vacuously.
18. Sampled RGBA recomposition introduced quantization false positives.
19. Skeleton selector assumed generic div markup and missed message-row spans.
20. Ordinal pagination fixture was consumed by dashboard-count requests.
21. Mobile tests assumed the desktop Filter control existed.
22. Android verification receipt omitted the historical negative-control script replay precondition.

Total: **41 unique defects**. Review coverage/density uses packet LOC in `reviews.md`; overlapping rereview LOC is not unique-code coverage. Compile/analyzer/formatting repairs (CS8604, SignInFailure assertion, CA1861, unused mock parameter, two Clippy repairs, rustfmt) and PowerShell logger quoting are recorded execution failures, not additional defects in this inventory. Eight existing native dead-code warnings remain follow-ups.
