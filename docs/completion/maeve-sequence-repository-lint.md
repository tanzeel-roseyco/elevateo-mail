# Sequence repository test lint repair

Input receipt: Soren's exact `b3aaa07e` full backend fleet run reported 21 migrations, Ruby 522 runs/7089 assertions and Steep zero problems PASS, while RuboCop `--lint` exited 1 with 19 offenses. Nine `Lint/AmbiguousBlockAssociation` warnings and one `Lint/StructNewOverride` warning belonged to Maeve's `apps/server/test/outreach_sequence/repository_test.rb`; other owners' offenses remain separate.

The test fake now returns its `Array` rows directly, retaining the `.to_a` interface consumed by `Repository#rows` without a Struct member that overrides `Struct#to_a`. Assertions wrap the `any?` block receiver in parentheses, and the final `count` result is assigned before `assert_equal`; their tested predicates are unchanged. No production source or authority was edited.

No host Ruby, RuboCop or application test was run by Maeve. Soren must rerun affected `bundle exec rubocop --lint test/outreach_sequence/repository_test.rb` and the repository test in his fleet-02 Docker lease on an exact imported SHA, then report exits, case/assertion counts and cleanup. This local source repair is not a lint PASS until that receipt exists. Actual model identity: Codex `gpt-6-sol` per Orca worker-show in the current dispatch.
