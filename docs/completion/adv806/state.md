# ADV806 status

Source authored, runtime/lint/typecheck NOT_RUN; independent source/design review PENDING. Application IN PROGRESS. No host tests, build, install, Docker, browser, paid services, live/public email or vault writes occurred.

Two real HTTP cases add invite replay/password immutability and recovery known/unknown generic outcomes, fixed callback, scanner nonconsumption, consumed-link rejection, durable verified password rejection and resumption, completed-entry replay denial, old-password denial and replacement-password real login. Every successful login/accept must resolve the actual actor and organization. Negative controls require exact status/code and no local session; no broad 401/403 success rule.

Expiry remains MISSING: no existing owned bounded fixture ages pinned Auth issuance timestamps or local pending expiry. The precise proposed fixture change is in handoff.md; it is not implemented or executed. Password rejection/resumption uses real Auth's same-password rule, not a fake response. OS crash/process-restart and actual browser completion remain separate missing evidence; replacing a cookie jar is only interrupted HTTP-client resumption.
