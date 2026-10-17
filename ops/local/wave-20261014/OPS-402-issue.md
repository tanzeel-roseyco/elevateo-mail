Owner: Soren
Ticket: OPS-402
Branch: `ops/soren-supabase`

Own fleet resource admission and Docker build/test queue. Provision independent persistent live/test Supabase identities, pinned components, private ingress, Auth and Storage, exact cleanup, backup and restore verification.

All Docker builds and application tests must run on fleet-02; preserve unrelated workloads and persistent data.

Acceptance: reviewed changes, relevant container tests on fleet-02, synchronized project and Obsidian documentation, exact evidence and unresolved issues. No public release before required automated and visual gates.