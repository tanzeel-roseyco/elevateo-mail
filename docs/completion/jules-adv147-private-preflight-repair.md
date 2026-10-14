# ADV147 ? private browser probe repair

Independent static review: 7738f8fd5d81b3da0a4c8eaed2c7e9bf6a5971d4 and test successor 1fcb462f985eb713a129cdd93b9c8b3d832b97e5, feature integration reported 61a12b7c. Zero confirmed new defects across 152 unique versioned source LOC: 0.00/KLOC. ADV144 dangling-symlink finding is statically closed with meaningful real-filesystem witnesses. Actual mounted browser preflight remains pending.

## Coverage

acceptance_runtime.py current lines 165?205: 41 LOC, plus seven removed shell-preflight predecessor lines. test_acceptance_private_output.py current lines 1?101: 101 LOC, plus three removed fixture-directory creation lines from 7738f8fd. Total 142 current + ten removed = 152 unique versioned source LOC, including context/comments/blanks; each read below 180 LOC. Changed hunks inspected first. No other implementation source inspected. Receipt text is evidence, not counted source.

## Functional assessment

Runtime lines 191?193 combine O_CREAT, O_EXCL and O_NOFOLLOW with mode0600 and derive actual created mode from the open descriptor. Existing regular files and live/dangling final-component symlinks fail exclusive creation without truncating/following targets. Created is set only after open succeeds, so finally does not unlink pre-existing entries after an open error. On successful creation, finally closes and removes the probe, including when later stat/stdout work throws. Output contains umask and permission numbers only, not auth or fixture bytes. Parent method only writes success receipt after execute succeeds and exact mode text matches.

Tests 60?68 exercise actual Node creation and removal; 70?83 assert live-link target contents and link preservation; 85?97 assert dangling target remains absent and link survives. These regressions would expose the previous shell redirection bug rather than merely asserting a new command string. The successor explicitly creates both output and native-private directories with0700, fixing the earlier fixture's implicit0755 parent. Three fake-output tests still exercise receipt and wrong-mode rejection. Existing regular-file refusal follows O_EXCL semantics but lacks a dedicated runtime witness.

## Actual evidence and limits

Read docs/completion/qa815-evidence/acceptance-private-7738f8fd5d81.txt: exact7738f8fd, six tests, one failure because observed root mode was755 versus700; exit1. This failure is preserved, not passed retroactively.

Read docs/completion/qa815-evidence/acceptance-private-1fcb462f985e.txt: exact1fcb462f, image sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f, 2026-10-14T18:22:08Z?18:22:09Z, six total tests PASS exit0, archive_absent=yes, remaining_task_containers=0. Of those six, three invoke actual Node filesystem behavior and three use FakeTask; ?six real Node cases? would overstate the receipt. This reviewer did not execute anything. No actual /output mount, Playwright reporter --list, authenticated browser case or publication-mode proof follows.

Remaining assumptions: statSync follows parent-directory symlinks; the root is fixed /output in production, but verified mount ownership/parent types are outside this packet. The created flag proves this process created the entry, not identity against concurrent replacement. In a task-owned private directory this is a reasonable assumption; a hostile concurrent writer requires inode/type checks before unlink. A closeSync failure prevents subsequent unlink because the finally body is sequential; outer task cleanup and failed-cleanup reporting remain excluded and unverified. No close/stat/unlink fault-injection regression was inspected. These are explicitly limited dependency/failure-path risks, not additional proven reachable implementation defects.

## Design tradeoff simulation

Exclusive no-follow creation moves safety ahead of mutation: simulated dangling-link input now refuses to create its target and preserves the link for inspected cleanup. A normal fresh directory produces0600 proof and removes only its newly created entry. A755 root is rejected despite safe proof-file mode, because directory privacy is independently required. This narrow disposable probe provides strong local path evidence without reading credentials, while same-image mounted execution remains the necessary integration gate. Do not equate unit filesystem safety with real-auth browser readiness.

Next owner gate: Soren exact-image mounted preflight and reporter --list, verify private output ownership/types and sanitized case record, plus task-scoped failure cleanup. No tests, Docker, implementation edits or new agents were used by this reviewer.
