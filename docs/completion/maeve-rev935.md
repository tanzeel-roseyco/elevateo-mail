# Maeve REV935 — QA816 attachment seed, bounded source review

- Reviewer: Maeve (Codex `gpt-6-sol`); dispatch `ctx_54ebfe83f0bb`, task `task_d619e41c9057`.
- Source pin: Nadia `2e1cc302d5a295f25845e289161be4e4a807e19d` on `completion-nadia-send810`; `tests/acceptance/qa816-attachments-seed.rb` lines 1–130. Reviewed 130 unique target-version LOC in one packet (including comments and blanks), 0 defects, 0.00 defects/KLOC. Static review only; application/runtime tests NOT_RUN by this reviewer.
- The final commit's response-tuple edit is on lines 188–200, outside this assigned slice and assigned to Felix. A diff display exposed that location but it was not assessed or counted as coverage. Lines 131–240, called helpers and runtime behavior remain unreviewed here. This report does not accept the full QA816 fixture or the final tuple repair.

## Findings within lines 1–130

No actionable defect established. The script checks explicit disposable, local and outbound-hold flags, private `/acceptance` directory ownership/mode, absence of a prior output, bounded regular seed file, schema/kind/variant and UUID-shaped primary/foreign tuples before fixture writes (37–51, 98–103). It pins both database connections to `db:5432/postgres` and named roles, rejects URI query/fragment, and verifies session identity (24–35). Message discovery requires exactly one fresh row per tuple and distinct primary/foreign message IDs (59–68), avoiding arbitrary-row selection. Storage keys include the validated organization UUID; scanner claims bind item ID and a fresh token, compare digest/key/byte size, fetch actual bytes, scan them, and require committed verdicts (69–84). SQL statements use positional parameters (60–63, 75–82, 109–125).

## Limits and tradeoffs

The early checks narrow accidental use, but static source cannot prove the container network and database are disposable; Soren's fleet evidence must establish that. Helper implementation, authorized HTTP response, final storage cleanup/fencing, and the changed tuple logic are outside this packet. No runtime PASS, secret-handling proof for called classes, or complete acceptance is inferred. The design uses direct fixture writes by a privileged role for disposable acceptance data; its controlled environment is therefore an operational precondition, not a general application write path.
