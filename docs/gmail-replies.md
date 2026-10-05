# Gmail replies

Manual Gmail drafts may include `replyToMessageId`. The source must be a complete, synced message in the same owner's selected Gmail mailbox, with validated original RFC Message-ID and bounded References. Imports and older cached messages without these headers cannot be threaded until synced again.

The server requires the reviewed To address to equal the source sender, the subject to match exactly, and CC/BCC to be empty. It rejects changed identities rather than silently redirecting a draft. The UI can unlink a reply to start an ordinary conversation. Custom Reply-To addresses are not supported in this first release; replies use the source sender.

The source ID participates in the approval revision. The immutable envelope stores the source thread ID, In-Reply-To and References; retries preserve that envelope. Saved draft recovery returns `replyToMessageId`; replacement drafts must retain it unless explicitly unlinked. Missing or incomplete sources return `reply_source_unavailable`; changed recipients/subject return `reply_identity_changed`.

The Gmail adapter sends the original threadId and RFC headers, as required by [Google's threading documentation](https://developers.google.com/workspace/gmail/api/guides/threads). Headers are bounded, validated and folded. Ordinary compose stays unchanged. Existing separate Gmail scope, sending permission, approval, quota and credential fences still apply. No credentials or live sending are enabled by this feature.
