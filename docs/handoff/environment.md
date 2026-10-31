# Environment inventory

This is the single operator-variable table for the handoff. It includes every name in [.env.production.example](../../.env.production.example), additional mail profiles not wired into that deployment, recovery/release inputs, and derived production container settings. No credential or example value is included. Required means required for the named operation, not permission to perform it. Use the company secret manager; named custodians remain [TO CONFIRM](README.md).

Sources: [deployment settings](../../ops/production/deployment_settings.py), [Compose](../../ops/production/compose.yaml), [Resend overlay](../../ops/production/compose.resend.yaml), [recovery](../../ops/production/completion/recovery.py), [Mox profile](../../apps/server/lib/elevateo/send_worker/production_mox_profile.rb), [IMAP config](../../apps/server/lib/elevateo/inbound/worker_config.rb), and [client release scripts](clients.md). The table distinguishes operator inputs from settings supplied by Compose; do not create independent secrets for aliases. Local bootstrap generates its environment; fixture/test-only variables are not company production inputs.

| Variable | Purpose | Source / custodian | Required or optional |
| --- | --- | --- | --- |
| `ELEVATEO_PRODUCTION_IMAGE` | Server release image digest | Approved registry build; Jeison | Required deploy |
| `ELEVATEO_MCP_IMAGE` | MCP release image digest | Approved registry build; Jeison | Required deploy |
| `ELEVATEO_OPERATIONS_IMAGE` | Operations tooling image digest | Approved registry build; Jeison | Required deploy |
| `ELEVATEO_BACKUP_HELPER_IMAGE` | GNU tar/sh image digest | Approved registry; Jeison | Required deploy/recovery |
| `POSTGRES_PASSWORD` | Database administrator password | Secret manager; DB administrator | Required |
| `AUTH_DB_PASSWORD` | Auth database role password | Secret manager; DB administrator | Required |
| `REST_DB_PASSWORD` | REST authenticator password | Secret manager; DB administrator | Required |
| `STORAGE_DB_PASSWORD` | Storage database role password | Secret manager; DB administrator | Required |
| `MIGRATOR_DB_PASSWORD` | Migration role password | Secret manager; DB administrator | Required |
| `API_DB_PASSWORD` | API database role password | Secret manager; DB administrator | Required |
| `WORKER_DB_PASSWORD` | Worker database role password | Secret manager; DB administrator | Required |
| `ATTACHMENT_GATEWAY_DB_PASSWORD` | Restricted gateway role password | Secret manager; DB administrator | Required |
| `SECRET_KEY_BASE` | Rails secret | Generated secret; Jeison | Required |
| `JWT_SECRET` | Supabase signing secret | Generated secret; identity administrator | Required |
| `ANON_KEY` | Signed anonymous-role JWT | Generated against JWT signing secret | Required |
| `SERVICE_ROLE_KEY` | Signed privileged service JWT | Generated against JWT signing secret | Required; never client-side |
| `ELEVATEO_SESSION_KEY_BASE64` | Application session signing key | Independent generated secret | Required |
| `ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64` | API/gateway request authentication | Independent generated secret | Required |
| `ELEVATEO_AUTHENTIK_ISSUER` | OIDC application issuer | Authentik administrator | Required |
| `ELEVATEO_AUTHENTIK_GROUP` | Approved group identifier | Authentik administrator | Required |
| `ELEVATEO_AUTHENTIK_API_TOKEN` | Directory membership lookup | Authentik administrator | Required |
| `ELEVATEO_AUTHENTIK_CLIENT_ID` | OIDC application identifier | Authentik administrator | Required |
| `ELEVATEO_AUTHENTIK_CLIENT_SECRET` | OIDC application credential | Authentik administrator | Required |
| `ELEVATEO_ATTACHMENT_BUCKET` | Private bucket identifier | Approved storage configuration | Required |
| `ELEVATEO_MCP_HTTP_HOST` | Allowed MCP Host header | Approved public route plan | Required |
| `ELEVATEO_MOX_HOSTNAME` | Provisioned Mox/TLS hostname | Mail/DNS administrator | Required deploy |
| `ELEVATEO_MOX_IPV4` | Mox public interface address | Infrastructure administrator | Required deploy |
| `ELEVATEO_MAIL_DOMAINS` | Domains initialized in Mox | Approved mail-domain roster | Required deploy |
| `ELEVATEO_WORKSPACE_DOMAINS` | Domains excluded from Mox initialization | Existing mail-system owner | Required deploy |
| `ELEVATEO_MOX_TLS_CERT_BASE64` | TLS certificate chain | Approved certificate issuer | Required deploy |
| `ELEVATEO_MOX_TLS_KEY_BASE64` | Matching private TLS key | Secret manager; mail administrator | Required deploy |
| `ELEVATEO_APPROVED_ASSIGNMENTS` | Absolute approved CSV path | Jeison; Callum approves access | Required deploy |
| `ELEVATEO_EGRESS_ID` | Provisioned egress identity UUID | Approved mailbox routing plan | Required deploy/provision |
| `ELEVATEO_OUTBOUND_MODE` | Select held or optional provider behavior | Approved transport decision | Optional default; validated |
| `ELEVATEO_OUTBOUND_HOLD` | Prevent live sending | Safety policy; Compose forces hold | Required safety invariant |
| `ELEVATEO_PROVISIONING_ENABLED` | Permit assignment mutation | Callum's provisioning approval | Optional; disabled by default |
| `ELEVATEO_MAILBOX_DAILY_SEND_LIMIT` | Per-mailbox ceiling | Approved send policy | Optional bounded default |
| `ELEVATEO_USER_DAILY_SEND_LIMIT` | Global per-user ceiling | Approved send policy | Optional bounded default |
| `RESEND_API_KEY` | Submission credential | Resend account administrator | Required only Resend mode |
| `RESEND_WEBHOOK_SECRET` | Provider-event signature secret | Resend account administrator | Required only Resend mode |
| `ELEVATEO_RESEND_FROM_DOMAIN` | Approved provider sending domain | Mail/Resend administrator | Required only Resend mode |
| `COMPOSE_FILE` | Absolute recovery Compose file list | Jeison; approved exact files | Required recovery; deploy overrides |
| `COMPOSE_PROJECT_NAME` | Recovery project identity | Jeison; isolated target for restore | Required recovery; deploy overrides |
| `ELEVATEO_SOURCE_REVISION` | Exact source revision for snapshot | Git release commit | Required recovery |
| `ELEVATEO_OPERATIONS_LOCK` | Absolute shared private lock path | Host administrator | Required deploy/recovery |
| `ELEVATEO_BACKUP_AGE_RECIPIENT` | Encryption public recipient | Offline recovery-key custodian | Required backup |
| `ELEVATEO_BACKUP_SSH_HOST` | SFTP account and host | Backup administrator | Required off-host backup |
| `ELEVATEO_BACKUP_REMOTE_DIR` | SFTP destination directory | Backup administrator | Required off-host backup |
| `ELEVATEO_BACKUP_SSH_KEY_BASE64` | SFTP private key | Secret manager; backup administrator | Required off-host backup |
| `ELEVATEO_BACKUP_KNOWN_HOSTS` | Pinned public SSH host-key file path | Independently verified backup host | Required off-host backup |
| `ELEVATEO_BACKUP_AGE_IDENTITY_BASE64` | Offline decryption identity | Separate recovery-key custodian | Required restore only |
| `ELEVATEO_FINDER_PUBLIC_IP` | Expected distinct probe egress IP | Network administrator | Optional; absent disables probing |
| `DOCKER_CONTEXT` | Explicit local Docker engine selection | Local operator | Required for this handoff's local runs |
| `ELEVATEO_DRILL_RESTORE_COMPOSE_FILE` | Isolated drill target definition | Restore harness/operator | Required direct drill |
| `ELEVATEO_DRILL_RESTORE_PROJECT` | Fresh isolated drill project | Restore harness/operator | Required direct drill |
| `ELEVATEO_MOX_HOST` | Production SMTP/IMAP hostname | Approved production Mox profile | Required Mox transport, not wired by deploy |
| `ELEVATEO_MOX_VERIFIED_DOMAINS` | JSON verified sender-domain roster | Mail administrator | Required Mox transport, not wired by deploy |
| `ELEVATEO_MOX_CREDENTIALS_PATH` | Absolute private credential Bundle path | Secret manager materialization | Required Mox transport, not wired by deploy |
| `ELEVATEO_IMAP_PROFILE` | Explicit inbound profile | Reviewed inbound-worker setup | Required inbound Mox worker |
| `ELEVATEO_IMAP_CREDENTIALS_PATH` | Absolute inbound credential Bundle path | Secret manager materialization | Required inbound Mox worker |
| `ELEVATEO_IMAP_CA_PATH` | Fixture-only trust file | Isolated test harness | Required fixture profile only |
| `ELEVATEO_INBOUND_STORAGE_TOKEN` | Private incoming object storage access for IMAP and Resend ingestion | Secret manager; service-role alias in Resend overlay | Required ingestion credential unless protected-file alternative used |
| `ELEVATEO_INBOUND_STORAGE_TOKEN_PATH` | Legacy protected-file alternative to inline ingestion token | Operator-provisioned absolute regular file, mode 0600, root/process owned, one link, 32–4096 bytes | Optional; mutually exclusive with inline token |
| `ELEVATEO_INBOUND_STORAGE_BUCKET` | Incoming attachment bucket for IMAP and Resend ingestion | Attachment-bucket alias in overlay; IMAP worker configuration | Required for ingestion |
| `ELEVATEO_WEB_ORIGIN` | Native hosted web origin | Approved client/edge configuration | Required native configuration |
| `ELEVATEO_OIDC_ISSUER` | Native OIDC issuer | Identity administrator | Conditional native SSO |
| `ELEVATEO_OIDC_CLIENT_ID` | Native public OIDC client identifier | Identity administrator | Conditional native SSO |
| `ELEVATEO_UPDATE_MANIFEST_URL` | Native updater endpoint | Approved release channel | Conditional updater |
| `ELEVATEO_UPDATER_PUBKEY` | Update signature verification key | Release key custodian | Required signed updater |
| `ELEVATEO_NATIVE_ARTIFACT` | Candidate/QA artifact classification | Release scripts | Derived, not proof of approval |
| `APPLE_SIGNING_IDENTITY` | macOS signing identity | Apple account/keychain administrator | Required signed macOS |
| `APPLE_TEAM_ID` | Apple team identifier | Apple account owner | Required signed macOS |
| `TAURI_SIGNING_PRIVATE_KEY` | Update signing key | Release secret manager | Required signed macOS |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Update-key password | Release secret manager | Optional as key requires |
| `APPLE_KEYCHAIN_PROFILE` | Notarization credential profile | macOS keychain custodian | One notarization method |
| `APPLE_API_KEY` | Notarization API private-key file | Apple account owner | Alternative method, with ID/issuer |
| `APPLE_API_KEY_ID` | API key identifier | Apple account owner | Conditional API-key method |
| `APPLE_API_ISSUER` | API key issuer | Apple account owner | Conditional API-key method |
| `APPLE_ID` | Notarization account identifier | Apple account owner | Alternative account method |
| `APPLE_PASSWORD` | App-specific notarization password | Apple account owner | Conditional account method |
| `ELEVATEO_WIN_SIGN_PFX_BASE64` | Windows signing certificate/key | Release secret manager | Signed Windows; alternative to path |
| `ELEVATEO_WIN_SIGN_PFX_PATH` | Private mounted signing certificate path | Trusted build runner | Signed Windows; alternative to base64 |
| `ELEVATEO_WIN_SIGN_PFX_PASSWORD` | PFX password | Release secret manager | Required signed Windows |
| `ELEVATEO_WIN_SIGN_TIMESTAMP_URL` | Timestamp service | Signing provider | Required signed Windows |
| `ELEVATEO_API_BASE_URL` | Native API origin | Approved app configuration | Required production native client config |
| `ELEVATEO_OIDC_AUTHORIZE_URL` | Windows browser authorization endpoint | Identity administrator | Required Windows SSO |
| `ELEVATEO_ANDROID_KEYSTORE_BASE64` | Android signing keystore | Release secret manager | Required signed Android candidate |
| `ELEVATEO_ANDROID_KEYSTORE_PASSWORD` | Keystore password | Release secret manager | Required with keystore |
| `ELEVATEO_ANDROID_KEY_ALIAS` | Signing entry selector | Release key custodian | Required with keystore |
| `ELEVATEO_ANDROID_KEY_PASSWORD` | Signing entry password | Release secret manager | Required with keystore |
| `APK_BUILD_ROOT` | Writable external artifact directory | Build operator | Required Android script |
| `QA_CA_CERT` | Optional QA trust certificate | Isolated QA harness | Optional; not production trust |
| `ANDROID_HOME` | Installed SDK path | Android build image | Required; image supplies |
| `ELEVATEO_IOS_TEAM_ID` | iOS signing team | Apple account owner | Required signed iOS |
| `ELEVATEO_IOS_SIGNING_CERT_BASE64` | iOS certificate/key archive | Release secret manager | Required signed iOS |
| `ELEVATEO_IOS_SIGNING_CERT_PASSWORD` | Signing archive password | Release secret manager | Required signed iOS |
| `ELEVATEO_IOS_PROFILE_BASE64` | Provisioning profile | Apple account owner | Required signed iOS |
| `RAILS_ENV` | Rails execution environment | Compose | Derived required |
| `ELEVATEO_MODE` | Application mode | Compose | Derived required |
| `ELEVATEO_PROCESS` | Runtime process selector | Compose per service | Derived required |
| `ELEVATEO_DB_ROLE` | Restricted database identity | Compose per service | Derived required |
| `ELEVATEO_DB_HOST` | Private database hostname | Compose | Derived required |
| `ELEVATEO_DB_NAME` | Database name | Compose | Derived required |
| `ELEVATEO_AUTH_URL` | Private GoTrue endpoint | Compose | Derived required |
| `ELEVATEO_STORAGE_URL` | Private storage endpoint | Compose | Derived required |
| `ELEVATEO_MAILPIT_URL` | Isolated mail-capture endpoint | Compose | Derived |
| `ELEVATEO_SMTP_HOST` | Held/local SMTP endpoint | Compose | Derived |
| `ELEVATEO_SMTP_PORT` | Held/local SMTP port | Compose | Derived |
| `ELEVATEO_BROWSER_ORIGIN` | Allowed browser origin | Compose, coordinated domain configuration | Derived required |
| `ELEVATEO_COOKIE_SECURE` | Secure-cookie policy | Compose | Derived required |
| `ELEVATEO_SEND_API_ENABLED` | Send API availability, separate from hold | Compose | Derived |
| `ELEVATEO_SSO_ENABLED` | SSO feature switch | Compose | Derived required |
| `ELEVATEO_SSO_ONLY` | Exclude password fallback | Compose | Derived required |
| `ELEVATEO_SSO_PROVIDER` | Accepted identity provider | Compose | Derived required |
| `ELEVATEO_AUTH_PUBLIC_URL` | Browser auth endpoint | Compose | Derived required |
| `ELEVATEO_AUTH_JWT_ISSUER` | Accepted auth JWT issuer | Compose | Derived required |
| `ELEVATEO_AUTH_JWT_AUDIENCE` | Accepted JWT audience | Compose | Derived required |
| `ELEVATEO_AUTH_JWT_ALGORITHM` | Accepted JWT algorithm | Compose | Derived required |
| `ELEVATEO_AUTH_PASSWORD_MINIMUM` | Auth password policy | Compose | Derived |
| `ELEVATEO_ATTACHMENT_GATEWAY_URL` | Private gateway endpoint | Compose | Derived required |
| `ELEVATEO_ATTACHMENT_GATEWAY_DATABASE_URL` | Restricted gateway DB connection | Compose, gateway password | Derived secret |
| `ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN` | Gateway storage token alias | Compose, service-role JWT | Derived secret |
| `ELEVATEO_MCP_BACKEND_ORIGIN` | MCP API endpoint | Compose | Derived required |
| `PORT` | MCP listener port | Compose | Derived |
| `PGPASSWORD` | Database bootstrap client password | Compose, administrator password | Derived secret |
| `POSTGRES_DB` | PostgreSQL initial database | Compose | Derived |
| `JWT_EXP` | Bootstrap JWT expiry setting | Compose | Derived |
| `GOTRUE_API_HOST` | Auth bind address | Compose | Derived |
| `GOTRUE_API_PORT` | Auth listener port | Compose | Derived |
| `API_EXTERNAL_URL` | Public auth URL | Compose | Derived required |
| `GOTRUE_DB_DRIVER` | Auth database driver | Compose | Derived |
| `GOTRUE_DB_DATABASE_URL` | Auth database connection | Compose, auth role password | Derived secret |
| `GOTRUE_SITE_URL` | Auth site origin | Compose | Derived required |
| `GOTRUE_URI_ALLOW_LIST` | Allowed application redirects | Compose | Derived required |
| `GOTRUE_DISABLE_SIGNUP` | Auth enrollment behavior; app authorization still applies | Compose | Derived |
| `GOTRUE_JWT_ADMIN_ROLES` | Privileged JWT roles | Compose | Derived |
| `GOTRUE_JWT_AUD` | Auth JWT audience | Compose | Derived |
| `GOTRUE_JWT_DEFAULT_GROUP_NAME` | Default JWT group | Compose | Derived |
| `GOTRUE_JWT_EXP` | Auth JWT lifetime | Compose | Derived |
| `GOTRUE_SESSIONS_TIMEBOX` | Auth session timebox | Compose | Derived |
| `GOTRUE_JWT_SECRET` | Auth JWT secret alias | Compose, signing secret | Derived secret |
| `GOTRUE_JWT_ISSUER` | Auth JWT issuer | Compose | Derived |
| `GOTRUE_EXTERNAL_EMAIL_ENABLED` | Email/password provider availability | Compose | Derived |
| `GOTRUE_EXTERNAL_PHONE_ENABLED` | Phone provider availability | Compose | Derived |
| `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED` | Anonymous auth availability | Compose | Derived |
| `GOTRUE_CUSTOM_OAUTH_ENABLED` | Custom OIDC availability | Compose | Derived |
| `GOTRUE_CUSTOM_OAUTH_MAX_PROVIDERS` | Custom provider bound | Compose | Derived |
| `GOTRUE_LOG_LEVEL` | Auth logging policy | Compose | Derived |
| `PGRST_DB_URI` | REST database connection | Compose, REST role password | Derived secret |
| `PGRST_DB_SCHEMAS` | Exposed REST schema set | Compose | Derived |
| `PGRST_DB_ANON_ROLE` | REST anonymous role | Compose | Derived |
| `PGRST_JWT_SECRET` | REST JWT secret alias | Compose | Derived secret |
| `PGRST_DB_MAX_ROWS` | REST response row bound | Compose | Derived |
| `PGRST_LOG_LEVEL` | REST logging policy | Compose | Derived |
| `SERVICE_KEY` | Storage privileged JWT alias | Compose, service-role JWT | Derived secret |
| `AUTH_JWT_SECRET` | Storage JWT secret alias | Compose | Derived secret |
| `POSTGREST_URL` | Private REST endpoint for storage | Compose | Derived |
| `DATABASE_URL` | Storage database connection | Compose, storage role password | Derived secret |
| `STORAGE_PUBLIC_URL` | Storage service URL | Compose; private in this assembly | Derived |
| `FILE_SIZE_LIMIT` | Storage object size bound | Compose | Derived |
| `STORAGE_BACKEND` | Object persistence implementation | Compose | Derived |
| `FILE_STORAGE_BACKEND_PATH` | Storage volume path | Compose | Derived |
| `GLOBAL_S3_BUCKET` | Storage backend bucket namespace | Compose | Derived |
| `TENANT_ID` | Storage instance identity | Compose | Derived |
| `REGION` | Storage region label | Compose | Derived |
| `ENABLE_IMAGE_TRANSFORMATION` | Image transformation availability | Compose | Derived |
| `MP_SMTP_RELAY_ALL` | Mailpit relay policy | Compose | Derived |
| `MP_SMTP_DISABLE_RDNS` | Mailpit reverse DNS behavior | Compose | Derived |
| `MOX_DOCKER` | Mox container execution mode | Compose | Derived |
| `GOMAXPROCS` | Mox Go processor bound | Compose | Derived |
| `GOMEMLIMIT` | Mox Go memory target | Compose | Derived |
| `COMPOSE_DISABLE_ENV_FILE` | Prevent implicit dotenv loading during deployment | deployment.py | Derived required |

Release command variables `SERVER_IMAGE`, `MOX_IMAGE`, `OPERATIONS_IMAGE`, `DOCKER_IMAGE`, `HELPER_IMAGE`, `REVISION` and `RUST_IMAGE` are local shell/build arguments, not application environment configuration. Obtain them from inspected approved images and Git as described in verification. iOS `ELEVATEO_SSO_AUTHORIZATION_ENDPOINT`, `ELEVATEO_SSO_CLIENT_ID` and `ELEVATEO_SSO_REDIRECT_URI` are Xcode build settings, not secret environment inputs to build.sh. Standard tool variables such as PATH/HOME and script-local temporaries are not operator configuration.
