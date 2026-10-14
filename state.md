# Project state

Application IN PROGRESS: R18 integrates exact reviewed Mira c69d0c58 (including a5c57be9) and Nadia e19085bf (including 07a05526) invitation browser/producer harnesses over immutable 86036e27. Production, contracts, observer boundary and four Docker recipes remain unchanged. New invitation runtime NOT_RUN; observer OFF, BE02 OPEN/unaccepted, BE03 closed.

Sealed R18 on 86036: conflict SCN-DRAFT-001-F1 PASS (1928ms), revocation SCN-READ-001-F2 PASS (3661ms), each with canonical GUI restoration, authenticated HTTP, worker drain and exact cleanup/independent absence PASS. Logout SCN-AUTH-003-F2 FAILED (824ms), cause UNKNOWN. Core four/eight visual checks were NOT_RUN in R18. R19 continues the same frozen 86036 core/visual request; login/read chains PASS are interim, not a final result. Preserve the R18 seal and earlier failures in linked history.

R12 visual evidence totals 21 PNGs: core16, empty1, unavailable1, settled-search1, pending/error2. ADV815 is accepted actual 6 runs/107 assertions/zero failures on unchanged backend inputs. F2 memory-only recovery limitation remains OPEN; no durable local recovery claim.

Repository obsidian.md uses the verified 140997-byte fleet pending mirror. Actual vault remains 134117 bytes, unchanged because C: is full; local sync is PENDING and root remains its sole writer. Root owns acceptance; Cassian integrates; Soren alone runs fleet Docker. Authority task_4879c20b5815 / ctx_d4ef4c853b9f. See [handoff](docs/completion/int401-r18-handoff.md), [history](docs/completion/int401-status-history-20261014.md) and [milestones](docs/completion/int401-remaining-milestones.md).
