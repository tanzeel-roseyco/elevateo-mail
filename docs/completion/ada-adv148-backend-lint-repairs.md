# ADV148 — backend lint repair semantics

Source-only independent review; no application tests, lint, builds, Docker, live operations or source edits. Five immutable commits: Maeve ba4323f87f8c81de463b89b1bc8e2584f77e401f; Nadia 200fc01674f63b0c9447a7ae7a57fe55f0a7cfd7; Sabine 28ef4d561f75722c2293512ab310db8647037a1e; Corin f8d54cd7c88a3f80a623c0ea1f08aac30aea28ef; Orion 435333b16f1777f0475ba90e6e56d2aff1828d31. Orion source read in completion-orion-native812; other objects read through Cassian integration. Integration import/runtime identity was not independently accepted.

## Exact source coverage

Changed hunks with two context lines, counting both parent and repaired versions:

- Maeve test/outreach_sequence/repository_test.rb: parent ranges 15–19,53–57,69–78,82–86,103–107,113–117,126–131,138–142; repaired 15–18,52–56,68–77,81–85,102–106,112–116,125–130,137–142: 94 LOC. Production lib/elevateo/outreach_sequence/repository.rb 153–162 adds 10 LOC.
- Nadia controller inbox_attachments_controller.rb old/new 30–34 and attachments/service_test.rb old/new 109–113:20 LOC.
- Sabine attachment_gateway/migration_acl_test.rb old/new 59–63 and68–72:20 LOC.
- Corin fake_inbound_controller.rb old14–20/new14–19:13 LOC.
- Orion attachment_gateway/authority_database_test.rb old14–19/new14–20:13 LOC; additional final19–27 adds7 unique LOC after overlap.

**177 unique versioned source LOC; 0 confirmed defects; density0/177=0 per KLOC.** Each source hunk/slice is below180 LOC. Documentation diff was read separately and excluded from source denominator.

## Maeve fake and assertions

Returning Array rows replaces a Struct member named to_a. The actual repository consumer invokes exec_query(...).to_a, so Array preserves the interface used here, including empty [] rather than nil. This does not alter production binds or transactions. Parenthesized any? assertions now explicitly test the SQL predicate; assigning the count before assert_equal preserves the final-read comparison and avoids accidental block attachment to the assertion. Read/write authority distinction, no-insert replay, no-delete reschedule failure and eight-step-bind assertions are retained in the hunks. The fake is not proof of real SQL behavior.

## Nadia unavailable storage and capabilities

NoStorage.put accepts keywords through **_options rather than requiring an unused content_type keyword, but still raises Invalid unconditionally. Thus its accepted invocation shape broadens while its security outcome stays unavailable: missing, extra or normal content_type options cannot create an object. This is safe for an unavailable adapter, not precedent for widening a real storage implementation's validation. The capability assertion explicitly maps the recorded checks before comparing the same five write/read symbols; it does not remove denial or change the expectation.

## Sabine ACL assertions

The exact filtered nonowner USAGE ACL and empty nonowner rollback ACL expectations are unchanged. Parentheses bind select/reject to the ACL value before assertion, strengthening clarity without granting privileges, skipping assertions or editing migration behavior. The full up/down fixture and effective-role execution were not covered or run here.

## Corin guard keyword

query: _query continues to accept the required keyword named query while renaming its unused local binding. Actor UUID extraction and returned guard list remain identical. Removing the unused local annotation does not remove actor/session or mailbox authorization; neither implementation is modified in this hunk. Malformed/null actor values still flow to the existing UUID boundary rather than a fallback.

## Orion seven SQL binds

The local attachment_values retains this exact order: attachment,organization,mailbox,thread,message,quarantine key,SHA256. The SQL still uses $1–$6 for the corresponding identifiers/key and $7 for SHA; filename,MIME,size7 and synthetic clean status remain literal fixture values. Moving the array out of the heredoc argument fixes Ruby parsing without changing SQL authority or the synthetic-only comment. It introduces no real clean-scan claim or download permission. Subsequent current-context/generation query is unchanged in the inspected context.

## Design simulations and remaining gate

- Empty sequence fake result: [].to_a remains []; repository handling sees the same empty rows. SQL assertions now receive the boolean/count intended by their author.
- Storage caller omits or adds a keyword: unavailable stub still raises, with no upload path. Actual adapters must retain their own stricter contracts.
- Authority fixture swaps mailbox/thread binds: SQL binding becomes wrong and the real authority test should fail; this repair preserves the original ordered tuple rather than abstracting it behind a helper.

These narrow repairs avoid a framework or mock redesign and keep authorization semantics at existing boundaries. No confirmed semantic blocker found. Source review does not prove lint/runtime success: Soren must execute the coherent imported source, explicitly include authority_database_test.rb, and retain exact test identity/counts/cleanup. The reported522-case manifest omitted that fixture, so full backend completion is not established.

Excluded: complete fixtures, inherited authorization helpers/RLS and migration implementation, production sequence behavior beyond the10-line rows consumer, real attachment gateway/network/scanner, integration import provenance verification, whole-project standards/lint/visual tests. Documentation explains the narrow repair and pending gates. Simulations supplied for root/Jules Obsidian recording only.
