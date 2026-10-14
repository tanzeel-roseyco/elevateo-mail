# ADV154 — attachment typing repair

Exact source: Nadia b3899a068b7f9ab89e7bb84e2d847552fd344c00, completion-nadia-send810. Source-only review; runtime NOT_RUN. No tests, builds, Docker, live services, or production edits performed.

## Coverage and findings

115 unique versioned source lines reviewed; largest read 63 lines. Coverage: controller parent 118–128 and target 30–40, 92–154; NoStorage RBS parent/target 12–18; service test parent 50–53 and target 50–61. Overlapping target lines counted once. Documentation: docs/completion/nadia-fix933.md. Confirmed defects: 0. Defect density: 0/115 LOC, 0 per KLOC. This is bounded static evidence, not acceptance of the complete attachment feature.

## Storage stub contract

Ruby NoStorage accepts arbitrary keyword arguments and unconditionally raises Attachments::Invalid. The RBS change to **String represents the supported typed keyword values without introducing a success fallback. Its nil return annotation cannot cause an actual successful return from this implementation. The regression independently supplies the normal content_type keyword and an unexpected keyword, expecting Invalid in each case; a Ruby argument mismatch or accidental successful return would fail those assertions. No authorization or storage capability is added.

## Snapshot boundary

The explicit String guards on scan_status and row id narrow actual values before constructing the gateway binding. They do not cast, stringify, or substitute invalid values. Missing rows remain unavailable; malformed nonstring status becomes unavailable; non-clean string status remains held. A clean row must retain exact attachment id equality, String filename/MIME, and bounded positive Integer size.

The inspected snapshot authenticates the current cookie, authorizes its context/version, and performs direct_message authorization before the exact organization/mailbox/thread/message/attachment metadata lookup. Current generation/context/version guards remain. The repair adds neither a bypass nor a relaxed proof tuple. No network call occurs inside this inspected database snapshot.

## Design simulations

- A nil or false status fails before gateway binding; an unknown String status remains held. Neither becomes a fabricated clean attachment.
- A nonstring or foreign row id cannot enter the signed fields/binding. Explicit guards preserve invalid input rather than turning it into a plausible identifier through to_s.
- Valid clean metadata follows the existing authorized path. Revocation handling depends on the existing current-session authorization and the later snapshot, whose caller was not rereviewed here.
- Missing storage rejects ordinary and extra-keyword put calls identically. Aligning the signature is simpler than adding a compatibility wrapper or permissive fallback.

## Remaining proof and exclusions

Soren must execute the focused strict typing, lint, and denial regression checks on the integrated snapshot. The new tests do not themselves exercise malformed metadata or revocation. This assignment excludes the content caller and its second authorization snapshot, gateway implementation, SQL helper/RLS, scanner, broad service tests, and runtime HTTP headers/bytes. No claim of route activation or full feature completion follows from this review.
