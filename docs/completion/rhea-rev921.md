# REV921: QA816 H/I repair source review

Reviewer: Rhea. Actual runtime identity: `gpt-6-sol` low; requested billing tier is unverified. Read-only static review on 2026-10-14; no application test, build or Docker was run, and no Tessa source was edited.

## Exact source and bounded coverage

| Repair | Commit | File | Exact final blob SHA-256 | Reviewed final lines |
| --- | --- | --- | --- | --- |
| H2 | `d3f2528f757adc531520c7aae2d0437e92f63573` | `tests/acceptance/playwright/qa816-assignee-options.e2e.ts` | `4a7cf036ef2286625870fe1dbe8c1974ad28b8d7f5aeab9231ed1ae5abd0d088` | 38–57 (20) |
| I2 + I3 | `d3f2528f757adc531520c7aae2d0437e92f63573` then `012df586a97d15fce0d21723f53cdcefbd880e0e` | `tests/acceptance/playwright/qa816-attachment-api.e2e.ts` | `a0a8ac3b05192e18cacd5144f3999e7c7862f714df8a6ec2be4687f5e91e0c84` | 10–35 and 59–112 (80) |
| Context | `012df586a97d15fce0d21723f53cdcefbd880e0e` | `tests/acceptance/shared/schema.ts` | `012443be82652152a2ed85ac072880f72347114b2b3a487bffc48d0625339f3b` | 94–116 (23) |

Final-source context read: 123 unique LOC. Superseded pre-repair diff lines read: 8 unique LOC, giving 131 unique versioned source LOC total; every source read was <=180 LOC and total is below the 180 LOC cap. Commit metadata and Tessa packet documentation were read separately. I did not inspect controller, SQL, gateway or fixture producer source. The final H/I hashes match `docs/completion/tessa-review-packets.md` exactly.

## Prior REV917 findings

1. **H leaked extra other-org UUID: closed at source.** The happy case now derives the complete primary mailbox membership set from the private seed, requires a terminal page at limit 50, and compares the sorted returned UUID array exactly. The seed schema maps `other_org` to its other mailbox and gives `revoked` no expected membership. A response adding either ID fails. This does not prove the seed reflects live SQL until fleet setup and Auth/API execution.
2. **I rejected content unrequested: endpoint denial closed at source; privacy wording remains open.** The case now requests rejected content and requires 423 JSON `attachment_held`, in addition to zero-byte rejected metadata. This matches the Cassian seam reported in Tessa's acceptance document. A 423 body can still include sensitive extra fields and pass, as detailed below.
3. **I foreign path mixed unrelated ancestry: repaired path, conditional authorization proof.** The request now uses a complete sidecar foreign mailbox/thread/message/attachment tuple. The loader checks the foreign mailbox and thread against the private seed and prevents reusing the primary message/clean attachment IDs. It does not itself prove that foreign message and attachment exist or belong to that thread; this must come from a trusted disposable fixture producer, which is not implemented. Until then, a 404 still cannot be attributed to authorization and the case is NOT_RUN.

The I3 correction requires `Content-Disposition: attachment; filename="attachment"` exactly, while metadata retains the fixture's safe original filename. That matches Cassian's **reported** fixed-header contract in Tessa's documentation; I did not read production controller code, so server conformance remains unverified.

## Residual defect: 1 MEDIUM inherited oracle gap

At I final lines 21 and 95–101, `errorSchema` allows arbitrary extra JSON fields and the held/rejected cases inspect only `code`. A 423 JSON body containing a private object URL, credential reference, storage key or encoded bytes can pass, while the recorded assertion says there is no private key or URL. This is an inherited test-oracle weakness exposed by the repair's stronger claim, not a newly introduced behavior. Require an exact safe error envelope or explicit sensitive-field absence based on Cassian's agreed error contract; keep the successful clean-byte hash oracle unchanged.

Density: **1 confirmed inherited MEDIUM / 123 current-source LOC = 8.13 defects/KLOC**; **0 confirmed new repair defects / 123 LOC = 0/KLOC**. This denominator describes reviewed current source, not the entire QA816 suite. The three historical REV917 findings remain historically counted; do not add this overlapping review to them as independent new coverage.

## Rubric and limits

The changes are small and retain clear case/helper names; there is no new class, nested hot-path loop, database query, production state mutation or credential handling. Strict UUID, bounded list, token and file-size schemas cover malformed/null inputs at the test boundary. H checks a nonempty terminal page but does not prove pagination at smaller limits or an empty eligible set. I checks clean exact bytes and safety headers, held/rejected errors and foreign 404, but no browser download UI, revocation, gateway outage or installed client. Each case fails on missing sidecar; no skip can become a PASS, yet **no trusted attachment fixture producer exists and no fleet browser run occurred**. The proposed exact error-envelope assertion is a small privacy tradeoff: it adds contract coupling but makes the no-leak claim falsifiable. Route/SQL/Auth coherence, fixture existence, and all runtime behavior remain unproven.
