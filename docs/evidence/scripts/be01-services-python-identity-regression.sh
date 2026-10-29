#!/usr/bin/env bash
# AIDEV-NOTE: Socket-free identity contract tests; run only in a reviewed Docker tools image with jq.
set -euo pipefail
cd "$(dirname "$0")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
manifest=be01-services-python-manifest.json
printf '%s  %s\n' f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a "$manifest" | sha256sum -c -
digest=sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a
config=sha256:4143a73d5a9804c1bb2f93cc823a7c173dbc62964d4a5ccabcb1167229b0e2b9
jq -n --arg d "$digest" '[{Id:$d,Os:"linux",Architecture:"amd64",RepoDigests:[("python@"+$d)],Descriptor:{digest:$d,mediaType:"application/vnd.oci.image.manifest.v1+json"}}]' > "$work/base"
check() { jq -se --slurpfile manifest "$manifest" -f be01-services-python-identity.jq "$1" >/dev/null; }
check "$work/base"
jq --arg c "$config" '.[0].Id=$c | del(.[0].Descriptor)' "$work/base" > "$work/classic"
check "$work/classic"
# Original config-only guard rejects the actual valid containerd shape.
if jq -e --arg c "$config" '.[0].Id==$c' "$work/base" >/dev/null; then exit 1; fi
for mutation in \
 '.[0].Id="sha256:wrong"' \
 '.[0].Descriptor.digest="sha256:wrong"' \
 '.[0].Descriptor.mediaType="application/vnd.oci.image.index.v1+json"' \
 'del(.[0].Descriptor)' \
 '.[0].Os="windows"' \
 '.[0].Architecture="arm64"' \
 '.[0].RepoDigests=[]' \
 '.[0].RepoDigests=["other@wrong"]' \
 '.[0].RepoDigests=null' \
 '. + .' \
 '[]' \
 'null'; do
 jq "$mutation" "$work/base" > "$work/bad"
 if check "$work/bad"; then echo "accepted invalid identity: $mutation" >&2; exit 1; fi
done
cat "$work/base" "$work/base" > "$work/stream"
if check "$work/stream"; then echo 'accepted multiple JSON documents' >&2; exit 1; fi
jq '.config.digest="sha256:wrong"' "$manifest" > "$work/wrong-manifest"
if jq -se --slurpfile manifest "$work/wrong-manifest" -f be01-services-python-identity.jq "$work/base" >/dev/null; then exit 1; fi
printf 'identity regression PASS: two valid stores, original discrimination, 14 negative cases\n'
