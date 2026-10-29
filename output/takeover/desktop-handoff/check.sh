set -eu
mkdir -p /tmp/elevateo-desktop-handoff/dist
printf '<!doctype html><title>Native compile fixture</title>' > /tmp/elevateo-desktop-handoff/dist/index.html
docker run --rm --name elevateo-desktop-handoff-rust -v /tmp/elevateo-desktop-handoff:/work -w /work/src-tauri rust:1.90.0-bookworm sh -c 'apt-get update -qq && apt-get install -y --no-install-recommends libwebkit2gtk-4.1-dev build-essential libssl-dev librsvg2-dev libayatana-appindicator3-dev >/dev/null && cargo test --locked --bin elevateo-mail-preview'
