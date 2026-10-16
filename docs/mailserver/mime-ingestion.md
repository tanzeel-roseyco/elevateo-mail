# Bounded IMAP MIME ingestion

MAIL1026 replaces the IMAP adapter's repeated parsing and simulated-only body rules with one
worker-private parse. Fleet-02 gate `be02-83b8e6910fa342619dedf86e14b44a19` passed 1,003 tests / 11,908 assertions, Steep, lint and frozen-source checks;12 dedicated suites remain deferred. See [evidence](../completion/qa815-evidence/mail1026-result.json).
The simulated FakeIngress contract and frontend plaintext-only rendering remain unchanged.

## Supported content and allocation limits

A message may contain one plain-text body, one HTML body, or one plain/HTML alternative. Plain
text wins regardless of part order. Both alternatives receive decoded-byte, encoding and NUL
validation. Mixed and related containers may hold that single body subtree and supported
attachments. Independent duplicate bodies, nested alternatives, signed containers, attached HTML,
message/rfc822 and unsupported binary types fail explicitly instead of losing content silently.

Raw messages are capped at 1 MiB. The MIME tree allows at most depth8, 24 nodes and 12 leaves.
Each body and attachment is capped at262144 decoded bytes; charset expansion is checked again
after conversion to UTF-8. Attachment bytes must be nonempty and their types must be PDF, PNG,
JPEG or plain text. Filenames are normalized to a bounded basename; bytes remain worker-private
until existing quarantine storage succeeds. An initial or partial storage failure creates no inbox
record; deterministic object keys support the storage adapter's existing retry semantics. This
slice does not itself provide the production storage adapter or an orphan-retention worker.

## Inert HTML conversion

Nokogiri's already-locked HTML5 parser becomes an explicit dependency; no newly installed package
is added. Parsing uses maximum depth64 and64 attributes per element. An iterative traversal
limits visited nodes to16384 and output to262144 bytes, removes active/head/template content,
ignores every URL attribute, decodes entities and preserves paragraph/break boundaries. The
result is text, never HTML supplied to a browser. A malformed but parseable document can produce
inert text; excessive parser limits raise a fixed invalid_text result.

Primary parser references: [HTML5 parsing options](https://nokogiri.org/tutorials/parsing_an_html5_document.html)
and [HTML5 fragment API](https://nokogiri.org/rdoc/Nokogiri/HTML5/DocumentFragment.html).
These describe parser limits; application safety claims additionally require this slice's tests.

## Review and validation plan

Selene reviewed318 design LOC and found two existing gaps: HTML/multipart rejection and repeated
parsing. Keeping the fake contract avoids widening simulated behavior. Regex stripping loses HTML
entity/tree semantics; using existing Nokogiri adds no separate parsing service or runtime pool.
Single parsing avoids repeated MIME allocations, but no RSS or throughput improvement is claimed
without measurement. No AI API, external service or paid dependency runs per message.

The boundary suite covers raw/decoded/transcoded sizes, MIME nodes/leaves, HTML attributes/nodes/
output, charset preservation, attachment count/order/types, unsupported MIME, active content and
storage failure ordering. A real private Mox fixture adds SMTP -> TLS IMAP -> worker process ->
tenant inbox checks for HTML and alternative messages. The real private Mox HTML/alternative worker process proof passed; source-bound results above include exact cleanup. General production/native acceptance remains open.

Section review: content selection preserves one unambiguous body; conversion emits plaintext;
allocation limits bound parser work; persistence remains behind storage; acceptance is source-bound.
Durable rejection receipts for poison messages are the next independent slice. Until then malformed
mail can repeatedly fail a scheduled poll. Production secrets, endpoint configuration, private
attachment worker composition, operational activation and app/native acceptance remain open.

Charset correction: Mail::Message#decoded already transcodes text. The adapter now uses Body#decoded to obtain transfer-decoded bytes, then converts body charset once; attachments retain exact bytes. Unknown transfer encodings yield invalid_mime. See [pinned Mail implementation](https://raw.githubusercontent.com/mikel/mail/2.9.1/lib/mail/message.rb).
