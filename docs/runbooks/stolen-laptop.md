# Runbook: lost or stolen laptop

Applies to any device that has held repository checkouts, SSH keys, `.env.*` stack credentials, provider API keys, signing material or a signed-in browser session. Assume the disk will be read even if the device was encrypted; encryption buys time, not immunity.

## First hour

1. Tell the pilot owner and the second operator. Record the time the device was last seen and what it held (use the inventory below).
2. Revoke the device's sessions: trigger a global logout for the user in Elevateo (`POST /v1/auth/logout` with `scope: global`), sign the Google account out of all devices, and revoke GitHub, Cloudflare, Hetzner, Resend, Apple, Google Play and Azure sessions from each provider's security page.
3. Remove the device's SSH public key from fleet-02 `~/.ssh/authorized_keys`, from the Hetzner project and from GitHub. Rotate the fleet SSH key pair for the affected user.
4. Rotate every secret the device could read: stack credential files (`ops/supabase/stack.sh <stack> init` regenerates them; coordinate downtime), provider API keys (Resend, Hunter, AnymailFinder), Cloudflare API tokens, GitHub personal access tokens, Docker context credentials, Telegram and Slack bot tokens.
5. Revoke code-signing material: the Apple Developer certificate and any Azure Artifact Signing certificate profile the device could use; re-issue and re-sign the next build.
6. Attempt a remote wipe (Find My, Intune or the vendor tool) and report the loss to the police and the insurer; keep the report number.

## Same day

- Bump `credential_version` for any mailbox whose SMTP or IMAP credentials were present on the device so in-flight work is fenced (`apps/server/lib/elevateo/mail_credentials/binding.rb`); re-enrol those mailboxes with new app passwords.
- Review `app.organization_role_audit` and `app_send_private.audit_events` for activity after the loss time.
- Check the Resend dashboard and the Gmail mailboxes for unexpected sends.
- Open an incident record using `docs/runbooks/incident-response.md` and decide whether notification duties apply (Privacy Act notifiable data breach if contact data was likely accessed).

## Before go-live: device and account baseline

| Control | Requirement |
| --- | --- |
| Full-disk encryption | BitLocker or FileVault on every device with repository or credential access; verified, recovery key in the password manager |
| Screen lock | 5 minutes, password or biometric |
| Password manager | Company vault for all provider logins; no credentials in notes, chats or text files |
| MFA | On GitHub, Hetzner, Cloudflare, Resend, Google, Apple, Azure and the password manager |
| Local checkouts | No `.env.*`, backups or exported mail on laptops; those live on fleet-02 or the production host only |

## Company-owned account inventory

Each account must be owned by a company identity with two administrators. Fill in the administrators column before go-live and keep it current.

| Account | Purpose | Administrators |
| --- | --- | --- |
| GitHub organization or repository | Source, CI, Dependabot | |
| Hetzner project | Production VPS, backups, fleet-02 | |
| Cloudflare | Registrar, DNS | |
| Resend | Transactional mail, webhooks | |
| Google Cloud project | OAuth consent screen if Gmail OAuth is used | |
| Google Play Console | Android distribution | |
| Apple Developer | macOS signing and notarisation | |
| Azure | Artifact Signing for Windows | |
| Hunter, AnymailFinder | Enrichment (optional) | |
| UptimeRobot, Sentry or GlitchTip | Monitoring | |
| Backblaze B2 or Hetzner Storage Box | Off-host backups | |
