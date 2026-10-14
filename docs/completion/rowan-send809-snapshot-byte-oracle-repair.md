# SEND809 worker snapshot byte oracle repair

Evidence: Soren exact integrated `7aa61be4649ca251c3faff368ba61dfa7e313708`, `completion-soren-qa815/docs/completion/qa815-evidence/backend-7aa61be4649c/028-ruby-suites.txt`, one `SendWorkerAuthorityDatabaseTest` failure at line 43. The displayed JSON bytes are identical, including UTF-8 U+2028, but PostgreSQL hex decoding through Ruby `pack("H*")` yields an ASCII-8BIT tagged string while the canonical producer returns UTF-8. Ruby string equality therefore fails on encoding semantics, before worker authorization checks.

Repair: mark the decoded bytes as UTF-8, assert the byte sequence is valid UTF-8, then compare it to the exact production canonical bytes. This keeps the complete snapshot byte oracle and the later authorization/final gate tests; it does not normalize or alter the SQL snapshot. Coverage is the three-line assertion replacement and roughly 45 surrounding test lines. No application tests or Docker run by Rowan; Soren must rerun `test/sends/worker_authority_database_test.rb` with real PostgreSQL.

Static source verdict: test decoding tag mismatch, not evidence that the persisted bytes changed. Runtime result pending.
