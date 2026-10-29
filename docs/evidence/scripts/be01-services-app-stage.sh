#!/usr/bin/env bash
# AIDEV-NOTE: Fixed eight-file delivery only; authenticate everything before either exclusive target creation.
set -euo pipefail
umask 077
: "${DELIVERY:?Private uploaded delivery root}" "${TOOLS_SOURCE:?Canonical source}"
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && $(realpath "$DELIVERY") == "$DELIVERY" ]]
cd "$DELIVERY"
[[ -z $(find . -type l -print) ]]
find . -type f -printf '%P\n' | sort > /dev/stdout
expected=$(printf '%s\n' ops/tools/be01-services-app/{dispatch.sh,parent-run.sh,regression.sh,package.sha256} ops/tools/be01-services-app-check/{checks.sh,parent-run.sh,regression.sh,package.sha256} | sort)
[[ $(find . -type f -printf '%P\n' | sort) == "$expected" ]]
[[ -z $(find . ! -type d ! -type f -print) ]]
printf '%s  %s\n' 6721b35694543a6e758df4547fa145491e737f8f9bb05a3e2ef7ffaefd35238f ops/tools/be01-services-app/package.sha256 cbc1fe83f8611d66a2c85fb7857550a0527498d48aba26c2706f75c320ab4b63 ops/tools/be01-services-app-check/package.sha256 | sha256sum -c -
sha256sum -c ops/tools/be01-services-app/package.sha256
sha256sum -c ops/tools/be01-services-app-check/package.sha256
cd "$TOOLS_SOURCE"
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b ops/tests/fleet02-egress-source.sha256 3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787 ops/tools/be01-services/package.sha256 | sha256sum -c -
for p in ops/tests/fleet02-egress-source.sha256 ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 ops/tests/be01-services/package.sha256; do sha256sum -c "$p"; done
for ancestor in "$TOOLS_SOURCE" "$TOOLS_SOURCE/ops" "$TOOLS_SOURCE/ops/tools"; do
  [[ -d $ancestor && ! -L $ancestor && $(realpath "$ancestor") == "$ancestor" ]]
  mode=$(stat -c %a "$ancestor"); (( (8#$mode & 1) == 1 ))
done
for target in ops/tools/be01-services-app ops/tools/be01-services-app-check; do [[ ! -e $target && ! -L $target ]]; done
# Trusted exclusive filesystem boundary: no concurrent writers between authentication and copying.
for target in ops/tools/be01-services-app ops/tools/be01-services-app-check; do
  mkdir -m 0755 "$target"
  for file in "$DELIVERY/$target/"*; do
    dest=$target/$(basename "$file")
    (set -o noclobber; cat "$file" > "$dest")
    chmod 0644 "$dest"
  done
  sha256sum -c "$target/package.sha256"
done
sha256sum -c ops/tests/fleet02-egress-source.sha256
printf 'STAGING_PASS\n'
