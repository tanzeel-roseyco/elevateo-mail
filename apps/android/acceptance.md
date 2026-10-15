# APK-813 installed-runtime acceptance request

Run on a disposable Android emulator and at least one actual Android device after the exact HTTPS app origin and same-origin session are configured. Record APK SHA-256, Android version, WebView version, test account/role, network mode, screen recording or screenshots, and cleanup. These cases are **NOT_RUN**; the fleet Docker compile cannot satisfy them.

| Case | Action | Required observation |
| --- | --- | --- |
| Launch and login | Install the debug-signed isolated QA APK, launch with network, sign in through its exact synthetic HTTPS origin. | Only the approved host loads; login uses the web session, protected mailbox data appears only after server authorization. No remote Tauri IPC is exposed. |
| Host boundary | Tap mail content links and navigate to lookalike hosts, HTTP, redirects and intent URLs. | External navigation is rejected or handed to the system browser under Orion's exact policy; no unapproved origin is rendered in the privileged WebView. |
| Logout and back | Open a thread, log out, press system Back repeatedly and relaunch. | No protected content flashes or reappears; server session is invalidated and login is required. |
| Resume and role change | Background/kill the app, revoke mailbox access from another session, then resume. | Session and mailbox scope are checked before protected content is shown; revoked mailbox remains inaccessible. |
| Offline and recovery | Disable network during read and during a pending draft write, then restore it. | Visible offline/error state, no fixture data, no automatic replay of the write, explicit retry after connectivity returns. |
| Keyboard and insets | Focus login, search and draft fields; rotate, open/close IME and vary gesture/navigation bars. | Focus stays visible, buttons are reachable, text is not covered, safe areas and screen reader focus remain usable. |
| Permission and callback | Inspect installed permissions; send unregistered HTTPS and custom-scheme intents. | INTERNET and the package-scoped signature-only receiver permission are the exact set; no app callback filter captures links before an approved App Link design. |
| Upgrade and signatures | Compare unsigned test APK, future signed candidate and upgrade/uninstall behavior. | Record signature identity, migration/data handling and rollback policy separately; unsigned compile cannot pass release signing. |

The test account is simulated or private test data only. No live provider sends, DNS change, OAuth registration or paid service is part of this request.

An unsigned compile-only APK cannot be installed and cannot satisfy these cases. The separate QA package uses
`com.elevateo.mail.qa`, a debug-only artifact marker and a domain-scoped disposable certificate. Release builds
must reject the QA marker and host. Android API 34 has booted and attached to Orca; application acceptance is
still NOT_RUN. An emulator is a host VM and is the required exception to containerized execution; every app
build and automated source test still runs in Docker on fleet-02.
