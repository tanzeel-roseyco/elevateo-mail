# Fable 5.1 frontend commission

User request: independently develop Elevateo Mail frontend mock-ups that excel in visual design and management efficiency. You are the lead designer and frontend implementer. Make your own strong, coherent design decisions and implement them, not just a written proposal. This is a frontend-only prototype, never a live email service.

## Working agreement

You own frontend design changes in this isolated worktree, source UI files, appropriate behavioural tests and this design report. You are not alone in the codebase: the orchestrator will prepare container verification and reviewers will inspect your changes. Do not revert others' changes. Read AGENTS.md, .planning/STANDARDS.md, README.md, state.md and documentation.md first. Existing approved frontend standards apply; backend/native implementation is outside this assignment. Search AIDEV anchors before editing and update their intent. No commits, pushes, deployments, DNS operations, credentials, package installation or shell execution. The parent runs tests in Docker and performs visual QA. Do not claim tests ran. Use your file tools to do the implementation.

## Creative ownership

Develop a coherent, premium, practical working environment, with a distinctive visual identity, disciplined typography, hierarchy, whitespace and dense-but-readable operational views. You decide the visual direction. Avoid decorative clutter, animated backgrounds, fake charts, external fonts, unnecessary dependencies or large refactors. System fonts and the existing React/Tailwind/Radix/lucide stack are sufficient. Make the improvement obvious on actual inbox, campaign and overview screens, not just the landing screen.

Prioritise what helps a person work faster: a clear next action, quick mailbox switching, uncluttered reading and reply, useful campaign status, discoverable bulk actions, visible selection/filter state and a cohesive navigation model. Keep existing working routes, deep links, keyboard navigation and simulated workflows intact. Do not add inactive controls masquerading as working functionality. Mobile, tablet, keyboard focus, reduced motion, contrast and empty/error states matter.

Use the existing implementation as a foundation, not a new parallel application. Target a focused change set, ideally about 600-1,000 authored application lines across small modules, with no file longer than necessary; avoid rewriting domain/data logic. The parent reviews slices of at most 200 lines. Do not minify or compress code to fit this target.

## Product truth

- Name: Elevateo Mail. Web plus planned Windows/macOS desktop. Mock data only; all simulated actions visibly labelled.
- Ten independent users; each can eventually connect ten mailboxes, with a maximum 30 sends per mailbox per day. Current nine fictional sender identities are a fixture. Do not claim backend quota enforcement exists.
- Gmail-style inbox plus opted-in outreach campaigns. No shared team data implied. Existing production integration and authentication are unimplemented.
- Hunter and AMF provide optional enrichment. AI performs personalisation. Codex CLI primary, Claude CLI fallback, users' own accounts; local AI is planned for desktop and must not appear connected in this browser prototype.
- AI reads selected mailboxes and drafts by default; sending separately enabled and approved. If you include AI or Connections mock-ups, clearly label them as previews with no actual credentials or connection claims.
- Root-domain MX must never be changed. Only explicitly approved subdomains could be managed by a future permission broker.
- Performance and ultra-low operating cost matter. Preserve initial JS budget <=250KB gzip and avoid polling, continuous animation or large dependencies.

## Deliverables

1. Implement the visual redesign and meaningful workflow improvements, maintaining the existing interactive mock app.
2. Add or adapt only behaviour tests affected by real workflow changes; never weaken existing tests just to make a redesign pass.
3. Write docs/design/fable-design.md: chosen direction, section-by-section workflow rationale, changed files, practical tradeoffs, known limits, and exact behaviours the parent must verify visually.
4. Update README Current state, state.md and documentation.md honestly for this branch; preserve the existing planning work. This worktree is C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable Frontend on design/fable-frontend. Linked PDFs remain in the original worktree until copied by the parent.
5. Finish with a concise implementation report. Do not merely offer to start. Implement using your file tools now.
