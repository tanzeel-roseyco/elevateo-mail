# ADV815 proof boundaries

ADV815 OFF406 R13: source authored on exact c3e69f2434753d2d8ea70133c56f03cee4feea3e; application IN PROGRESS. Runtime, lint, strict typing and Docker NOT_RUN. Independent functional/design review and defects/KLOC PENDING. Root owns integration and actual vault; Soren alone schedules execution.

New fixture locks one UUID AND random fixture email auth.users row, verifies the actual real-link hash matches its existing token and fresh issuance, and changes only the allowlisted issuance timestamp. Full before/after row comparison rejects changes to token or authority. Pending aging locks exactly the owned cookie SHA256 row and changes only expires_at. Both require inspected schema, supabase_admin/postgres and count1 inside a rollback-on-failure transaction. No clock/TTL policy change or restoration.

Expired invite and recovery each require Rails401/no cookie/no new local session plus uncertain pending state, separate real Auth403/otp_expired on an independently issued user/link, and independent unaged acceptance/password-login200. Local pending denial retains staged/no verified credentials/no session; fresh staging of the same real link succeeds, supplemented by an independent healthy actor. This distinguishes local denial from upstream expiry without claiming browser behavior.

RBS supplies concrete contracts, no new untyped declarations or diagnostic suppression. The frozen Steep target checks only application paths; it does NOT load these proof files/signatures. Root must approve a narrow typing target with real PG, Minitest and existing Be02 seams; no strict-check PASS is claimed. Linters own formatting.
