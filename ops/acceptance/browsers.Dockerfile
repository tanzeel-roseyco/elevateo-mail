# AIDEV-NOTE: Browser downloads are build-only; the fixed CfT record must match acceptance_runtime.py.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f
FROM ${NODE_IMAGE} AS compile
WORKDIR /opt/acceptance
ENV PUPPETEER_SKIP_DOWNLOAD=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY tests/acceptance/package.json tests/acceptance/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tests/acceptance/ ./
RUN npm run typecheck && npm run build

FROM ${NODE_IMAGE} AS chrome-download
WORKDIR /download
RUN node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const url = 'https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip';
const expectedBytes = 198195769;
const expectedSha256 = '55672d1f392fd3e7b7a08621b6e804e6bcb39d40cf155504abb74b3a021ea8ea';
// AIDEV-NOTE: A hard deadline also bounds a stalled destination write; failed build layers are discarded.
const deadline = setTimeout(() => {
  console.error('Chrome archive download exceeded 180 seconds');
  process.exit(1);
}, 180_000);
try {
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(180_000), headers: { 'accept-encoding': 'identity' },
  });
  if (response.status !== 200 || !response.body || response.headers.get('content-length') !== String(expectedBytes)) {
    throw new Error('Chrome archive response status/body/length mismatch');
  }
  let receivedBytes = 0;
  const sha256 = createHash('sha256');
  const verify = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > expectedBytes) return callback(new Error('Chrome archive exceeded byte limit'));
      sha256.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(response.body, verify, createWriteStream('/download/chrome-linux64.zip', { flags: 'wx', mode: 0o600 }));
  if (receivedBytes !== expectedBytes || sha256.digest('hex') !== expectedSha256) {
    throw new Error('Chrome archive size or SHA-256 mismatch');
  }
} finally {
  clearTimeout(deadline);
}
NODE

FROM ${PLAYWRIGHT_IMAGE} AS chrome-extract
USER root
COPY --from=chrome-download /download/chrome-linux64.zip /tmp/chrome-linux64.zip
# AIDEV-NOTE: Keep the full verified archive, including its notices; Python stdlib avoids another build package.
RUN python3 <<'PY'
from pathlib import Path, PurePosixPath
import stat
import zipfile

destination = Path('/opt/cft')
with zipfile.ZipFile('/tmp/chrome-linux64.zip') as archive:
    seen: set[PurePosixPath] = set()
    for member in archive.infolist():
        relative = PurePosixPath(member.filename)
        kind = stat.S_IFMT(member.external_attr >> 16)
        if (relative.is_absolute() or '..' in relative.parts or not relative.parts
                or relative.parts[0] != 'chrome-linux64' or relative in seen
                or kind not in (0, stat.S_IFREG, stat.S_IFDIR)):
            raise ValueError('Unsafe or duplicate Chrome archive member')
        seen.add(relative)
        extracted = Path(archive.extract(member, destination))
        # AIDEV-NOTE: zipfile drops executable bits; restore execution without carrying setuid/setgid permissions.
        executable = member.is_dir() or bool((member.external_attr >> 16) & 0o111)
        extracted.chmod(0o755 if executable else 0o644)
Path('/tmp/chrome-linux64.zip').unlink()
PY

FROM ${PLAYWRIGHT_IMAGE} AS browsers
USER root
COPY --from=compile /usr/local/bin/node /usr/local/bin/node
COPY --from=compile /opt/acceptance /opt/acceptance
COPY --from=chrome-extract /opt/cft /opt/cft
RUN test "$(node --version)" = v24.21.0 \
    && test -x /opt/cft/chrome-linux64/chrome \
    && groupadd --gid 10001 acceptance && useradd --uid 10001 --gid 10001 --no-create-home acceptance \
    && chmod -R a+rX /opt/acceptance /opt/cft
ENV HOME=/tmp PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PUPPETEER_EXECUTABLE_PATH=/opt/cft/chrome-linux64/chrome PUPPETEER_EXPECTED_BROWSER_VERSION=155.0.8059.39
WORKDIR /opt/acceptance
USER 10001:10001
CMD ["sleep", "1800"]
