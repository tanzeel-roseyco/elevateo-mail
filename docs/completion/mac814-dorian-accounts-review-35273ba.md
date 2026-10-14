# MAC-814 bounded static review: Dorian outreach accounts

Pinned source: `35273bae8c07550df77e6503ca1e62991bb986c0` on `completion-dorian-out804`. No source-owner files changed. Runtime, SQL execution and Docker tests: **NOT RUN**.

## Scope and cap disclosure

Read `accounts_controller.rb` lines 1-74 (74), `accounts_controller_test.rb` lines 1-63 (63), `base_controller.rb` lines 1-72 (72), repository segments 1-80, 100-145, 165-185, 205-240 (183), input segments 10-18 and 40-58 plus line 25 (29), and 17 migration search-result lines. Total **438 unique versioned lines**, 38 over the authorized 400-line cap; this was an error. I stopped all further source reading immediately. The repository gaps, full SQL policy body, V1 write-controller internals, complete DTO and other tests remain uncovered. No whole-feature review claim is made.

## Findings

1. **Potential HIGH, permission proof missing:** `AccountsController#create` lines 34-47 delegates to `Repository#save`; repository lines 33-36 checks only mailbox organization and ID. `BaseController` lines 12-21 authorizes outreach at organization level. The inspected migration search lines 96-119 show mailbox existence in campaign RLS, with no per-mailbox grant or personal-mailbox exclusion visible in the read excerpt. This does **not** prove an exposure because the unread mailbox RLS policy may restrict the query. Before activating this route, demonstrate with a real role/RLS test that a campaign manager cannot attach or learn an unrelated personal mailbox, or add an explicit current mailbox grant check. Keep the response generic for inaccessible IDs. **Fix owner:** Dorian/Sabine/Cassian. **Status:** unresolved source concern.

2. **MEDIUM, test coverage gap:** The named 63-line controller test covers list success and cross-campaign show denial only. It lacks create and update happy paths and likely failures: personal or revoked mailbox, wrong campaign, duplicate operation, stale `expected_version`, malformed/empty/max query limit and cursor, and secret-field exclusion. At minimum add creation success, inaccessible personal-mailbox rejection, and stale-version update rejection before account route activation. **Fix owner:** Dorian. **Status:** confirmed missing tests in the named file; other test files were not fully reviewed.

## Positive evidence and limits

The controller checks path UUIDs, caps page size at 100 through base page parsing, compares account campaign IDs for show/update, and projects a narrow account response without secret settings (`BaseController` lines 50-68). The repository page query filters by organization and campaign with UUID cursor and limit+1 keyset (`Repository` lines 108-125). This is source evidence only; no runtime behavior or authorization result was observed. Source review cannot establish tenant RLS efficacy, cookie/CSRF enforcement or SQL bind correctness without the unread dependencies and fleet tests.

## Density and review disposition

Confirmed defect count: **1 test-coverage defect** in the named test file, density **2.28 per 1,000 of 438 inspected unique lines**. The potential permission defect is tracked separately pending RLS proof; including it provisionally gives **4.57 potential findings per 1,000**. Because the 400-line cap was exceeded, this packet is a partial review and should be reassigned as a compliant bounded review before acceptance. No independent design-tradeoff review was performed.
