# ATT lint repair (Nadia)

- Coherent fleet source: `b3aaa07e670c503df676b7b761cd9d3a008b0fbc`; receipt: `rubocop-b3aaa07e670c.txt` in Soren QA815 evidence. It reports `Lint/UnusedMethodArgument` at `app/controllers/v2/inbox_attachments_controller.rb:32` and `Lint/AmbiguousBlockAssociation` at `test/attachments/service_test.rb:111`.
- Source change: `NoStorage#put` consumes arbitrary keyword arguments as `_options` and still raises `Elevateo::Attachments::Invalid` unconditionally. This retains the `content_type:` call shape and does not permit object writes. The assertion parenthesizes the map expression so it still evaluates all five recorded capabilities before comparison.
- Scope: these two source lines plus README Current state, state.md, documentation.md, and this report. No ATT902 byte path, authorization policy, contract, route, gateway or scanner changes.
- Runtime: NOT_RUN here. Soren alone should run focused RuboCop lint on the two Ruby files in fleet-02 Docker, then the coherent full backend gate after all 19 findings are owner-repaired. Prior 21 migrations, 522 Ruby runs/7,089 assertions and Steep zero belong only to exact `b3aaa07e` and are not proof of this candidate.
- Actual authoring runtime: gpt-6-sol low; billed tier unverified.
