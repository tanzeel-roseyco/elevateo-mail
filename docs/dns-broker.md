# Restricted DNS planning boundary

`backend/dns-broker` is isolated, read-only code, not mounted by the mail worker. It cannot create, update or delete DNS. Its token must remain in a separate broker deployment, with DNS Read permission for one approved zone. No production deployment or token has been configured.

The trusted operator supplies owner, zone ID/name, subdomain and exact record names. These are not user self-grants. The planner validates existing TXT/CNAME/MX records and creates a five-minute hashed before/after review artifact. MX priority is explicit. Record identity/type changes, apex records, company roots, wildcards and existing `in.elevateoco.com` are denied. This first slice supports updates to existing records only, not discovery, creation or deletion. A hash is integrity identification, not human approval or execution authority.

The reader uses a fixed Cloudflare GET URL, a five-second deadline and 16 KiB response limit. Unknown responses fail closed. Rechecking compares the relevant record fields including TTL and MX priority. This is not atomic compare-and-swap: an administrator could change the record after the read. No mutation executor is implemented because provider conditional-write semantics remain unproven. Provider metadata such as tags/comments/settings is not represented by this planning artifact; a future writer must preserve or explicitly approve those fields.

Cloudflare tokens are scoped to zones, not individual record names. Broker policy does not constrain a stolen token used outside the broker. Separate credentials, access control and deployment are required before integration. Stronger provider-enforced isolation may require a separately delegated zone. Existing manual DNS policy remains unchanged.

Tests use injected responses only. No DNS calls, writes or credentials are needed. Analytical tradeoff assessment was used; Obsidian was unavailable.

Official references:
- [DNS update schema, including required MX priority](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/update/)
- [Token resources and zone scope](https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/)
- [Subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)
