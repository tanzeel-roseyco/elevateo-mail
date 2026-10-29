# Email finder configuration

The email finder adds **no credentials, API keys, or external accounts**. It reuses the
existing worker database configuration and Authentik-protected API sessions.

`ELEVATEO_FINDER_PUBLIC_IP` is nonsecret configuration: the Hetzner worker's public
outbound IP. Put it in the existing protected worker environment file referenced by
`ELEVATEO_WORKER_ENV_FILE`. An empty value disables SMTP probing with an explicit
health reason; discovery remains available. No value is supplied or activated by this change.

See [email finder operations](email-finder.md) for PTR, port 25 and verification limits.
