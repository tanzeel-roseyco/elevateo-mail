# BE-02 consultation budget correction

Status: corrected sequence completed with two successful opinions and one failed Fable 5.1 attempt. Dispatch stopped without retry. See result metadata and the final outcome below.

<!-- AIDEV-NOTE: List-cost thresholds are post-request stop controls, not billing or hard request caps. -->

## Failed evidence

Private evidence: `C:/Users/Tanzeel/AppData/Local/ElevateoCoordinator/be02-opinions-20261011T224952Z/{fable-5.json,fable-5.stderr,fable-5-launch.json}`. Raw JSON SHA256 `cd01df0cf722fec2a9d435ec4cfa94fe59da3e819390d54801522ec51374029a`.

Exit1, elapsed70.262s, session `0efe89f3-4fde-4ede-ad8c-281de5450ac2`, terminal `budget_exhausted`, subtype `error_max_budget_usd`. Requested and returned canonical `claude-fable-5`, provider firstParty. No opinion text returned. Model usage: input2, cache creation217644, cache read2733, output4219, thinking299; reported list cost $4.566583. Top-level usage is zero while modelUsage contains these counters; preserve both rather than treating zero as no consumption. This is not billing evidence or consultation success. Original $3 threshold failed to accommodate one completed request; original 20-minute deadline also exceeded the earlier accepted 15-minute envelope and is corrected below.

## Accepted envelope and estimate

[Earlier accepted BE-01 brief](../../.planning/consultations/results/initial-plan/BE-01-brief.md) specifies 15 minutes and at most $5 reported spend per opinion. That precedent does not prove a hard limit or unlimited subscription. Existing first-party Max access is authorized; Devin's $10 is separate. No purchase, extra usage, billing toggle or API route is proposed.

[Official CLI reference](https://code.claude.com/docs/en/cli-reference) explicitly says estimated spend may pass the cap. [Official environment reference](https://code.claude.com/docs/en/env-vars) documents `CLAUDE_CODE_MAX_OUTPUT_TOKENS`; it applies to most requests, not a guaranteed aggregate cost ceiling. [Official pricing](https://platform.claude.com/docs/en/about-claude/pricing) lists Fable5/5.1 one-hour cache writes $20/MTok and output $50/MTok; Opus5.5 $8/MTok and $20/MTok. Treat all 220379 observed input/cache tokens as cold one-hour writes, without assuming cache reuse. With 8192 maximum output tokens, estimated Fable request is $4.81718 and Opus $1.926872. At 225000 input tokens, estimates are $4.9096 and $1.96384. These are scenarios, not exact token counts for unexecuted models. Original Fable cost reconciles exactly as 217644*20/1M +2733*1/1M +2*10/1M +4219*50/1M =4.566583; do not add thinking again without evidence it is separately billed.

## Proposed bounded sequence for parent review

1. Preserve the current full 561092-byte common freeze and all three exact inputs. No context omissions, split, summaries, shared answers, model substitutions or cache-dependent estimate.
2. Refresh read-only auth/usage and exact route immediately before dispatch; stop if extra usage is enabled, included capacity unavailable or billing required. Never change account settings. Subscription percentages cannot be converted to dollars or guaranteed remaining calls.
3. Fresh independent processes, sequential concurrency1, safe-mode/tools-empty/no-session-persistence/JSON. Set process-only `CLAUDE_CODE_MAX_OUTPUT_TOKENS=8192`, `--max-turns 1`, `--max-budget-usd 5`, outer deadline900s. Verify supported turn/output controls before launch. No automatic retries or continuation after truncation; an incomplete answer fails the gate.
4. At most one replacement Fable5 call, then one Opus5.5 and one Fable5.1 call, inspecting each before the next. Stop on error, truncation, unsupported control, model/provider mismatch, reported cost above $5, rate/billing limit or missing complete answers. Record failed $4.566583 separately, never reset aggregate history. Three $5 stop thresholds total $15, plus historical $4.566583 = $19.566583 accounting envelope; this is NOT an enforced maximum. Conservative 225k-input scenarios total $11.78304 new list cost ($16.349623 including failure).
5. Remaining limitation: no verified hard pre-request dollar ceiling or exact full-request token count for each route. The $5 historical ceiling cannot be guaranteed by this CLI. Do not represent these controls as enforcing it. Parent explicitly accepted supported CLI stop controls with disclosed overshoot risk, not a hard billing cap or aggregate lifetime retry allocation. Existing authorization is sufficient for subscription access; this is not a purchase/permission request. The single reviewed replacement is now executed; no automatic retries are allowed.

FE retains fleet-02. No Docker, implementation, Devin, commits, pushes or ultrareviews. Frozen input copies/manifests remain unchanged; live status documentation is updated separately.

## Actual corrected outcome

Fresh included-access preflight: firstParty Max, CLI2.1.296; session18%, weekly82%, Fable68%, no usage-credit row; exact three routes listed. No account changes. Fable5 exit0 $4.580313, Opus5.5 exit0 $1.869067. Fable5.1 exit1 budget_exhausted/error_max_budget_usd $5.1038635, no opinion; session 2a338f0e-e483-4861-876a-4698ce59bd8e, elapsed184.840s. Requested max-turns1 but reported num_turns2. Top-level output8192 versus modelUsage9480; modelUsage input6, cache-write228721, cache-read221534. Preserve both counter sets; do not claim the environment variable bounded aggregate output or that a second coordinator launch occurred. No automatic retry was issued. The CLI threshold overshot by $0.1038635. Corrected sequence $11.5532435; cumulative including original failure $16.1198265, all list telemetry rather than billing. Third-opinion and MAX synthesis gates remain open.
