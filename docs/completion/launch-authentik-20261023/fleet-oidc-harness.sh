#!/bin/sh
set -eu
exec 2>&1
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 600 9
ns=authentik0c4fo
stage=/tmp/elevateo-authentik-ctx0c4f-oidc
pg=sha256:94b8c87f0970c71e7a2b24fdeec849254ed30f4fd12f4402f4be3faada9e69e7
auth=supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232
for name in db idp auth; do test -z "$(docker ps -aq --filter name=^$ns-$name\$)"; done
test -z "$(docker network ls -q --filter name=^$ns-net\$)"
cleanup() {
 for name in auth idp db; do
  if docker container inspect "$ns-$name" >/dev/null 2>&1; then docker inspect --format '{{json .Mounts}}' "$ns-$name"; docker rm -f "$ns-$name" >/dev/null; fi
 done
 docker network rm "$ns-net" >/dev/null
 for name in db idp auth; do test -z "$(docker ps -aq --filter name=^$ns-$name\$)" || return 1; done
 test -z "$(docker network ls -q --filter name=^$ns-net\$)" || return 1
 echo CLEANUP_EXACT_ABSENCE_PASS
}
finish() { result=$?; trap - EXIT; docker logs "$ns-auth" 2>&1 || true; cleanup || result=1; exit "$result"; }
trap finish EXIT
docker network create --internal --subnet 11.254.254.0/24 "$ns-net" >/dev/null
docker run -d --name "$ns-db" --network "$ns-net" --network-alias db --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=disposable-test-only-62817-strong -e POSTGRES_DB=postgres "$pg" >/dev/null
for attempt in $(seq 1 60); do if docker exec "$ns-db" pg_isready -U supabase_admin >/dev/null 2>&1; then break; fi; sleep 1; done
docker run -d --name "$ns-idp" --network "$ns-net" --ip 11.254.254.10 --network-alias idp --mount type=bind,src="$stage",dst=/source,readonly -e PGPASSWORD=disposable-test-only-62817-strong -e ELEVATEO_OIDC_DISPOSABLE=yes --entrypoint python3 "$pg" /source/oidc_fixture.py >/dev/null
for attempt in $(seq 1 60); do if docker cp "$ns-idp:/tmp/oidc-test-cert.pem" "$stage/cert.pem" 2>/dev/null; then break; fi; sleep 1; done
docker run -d --mount type=bind,src="$stage",dst=/fixtures,readonly -e SSL_CERT_FILE=/fixtures/cert.pem --name "$ns-auth" --network "$ns-net" --network-alias auth -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://auth:9999 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL=postgres://supabase_admin:disposable-test-only-62817-strong@db:5432/postgres -e GOTRUE_SITE_URL=http://client:3000 -e 'GOTRUE_URI_ALLOW_LIST=http://client:3000/**' -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_SECRET=disposable-oidc-regression-secret-never-production-20261023 -e GOTRUE_EXTERNAL_EMAIL_ENABLED=false -e GOTRUE_MAILER_AUTOCONFIRM=true "$auth" >/dev/null
ready=0
for attempt in $(seq 1 60); do if docker exec "$ns-auth" wget -q -O /dev/null http://127.0.0.1:9999/health; then ready=1; break; fi; sleep 1; done
if test "$ready" != 1; then docker logs "$ns-auth"; exit 1; fi
# AIDEV-NOTE: Private fixture issuer bypasses admin SSRF admission only in this isolated disposable database.
docker exec -e PGPASSWORD=disposable-test-only-62817-strong "$ns-db" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "INSERT INTO auth.custom_oauth_providers(provider_type,identifier,name,client_id,client_secret,scopes,issuer,discovery_url) VALUES ('oidc','custom:authentik','Disposable strict OIDC','fixture-client','disposable-client-secret',ARRAY['openid','email','profile'],'https://idp:8443','https://idp:8443/discovery'), ('oidc','custom:fallback','Disposable fallback control','fixture-client','disposable-client-secret',ARRAY['openid','email','profile'],'https://idp:8443/fallback','https://idp:8443/discovery-fallback');"
docker exec -e PYTHONDONTWRITEBYTECODE=1 "$ns-idp" python3 /source/test_oidc_runtime.py