"""Fetch exact official Android artifacts inside the disposable fleet build only."""
from pathlib import Path
import hashlib
import json
import stat
import time
import urllib.request
import zipfile

ROOT = Path('/opt/android-sdk')
# AIDEV-NOTE: Google's repository metadata publishes SHA1; record derived SHA256 and enforce size before extracting.
ARTIFACTS = (
    ('emulator-linux_x64-16428233.zip', 349654171, 'cd7362ea55dfb86a418958138dc396e74165dd01', ROOT),
    ('platform-tools_r37.0.1-linux.zip', 9054187, '477254aa5f903c15cf51001717bdf347fb6b53e0', ROOT),
    ('sys-img/android/x86_64-34_r04.zip', 720747116, '5f6a249f9bc3b1b4c459b13ce2eb646c9680bed1',
     ROOT / 'system-images/android-34/default'),
)


def main() -> None:
    records = []
    for name, expected_size, expected_sha1, destination in ARTIFACTS:
        archive = Path('/tmp') / Path(name).name
        url = 'https://dl.google.com/android/repository/' + name
        sha1, sha256, size, deadline = hashlib.sha1(), hashlib.sha256(), 0, time.monotonic() + 600
        with urllib.request.urlopen(url, timeout=30) as response, archive.open('xb') as out:
            if response.status != 200 or response.url != url:
                raise RuntimeError('Unexpected Android archive response')
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > expected_size or time.monotonic() > deadline:
                    raise RuntimeError('Android archive size/deadline exceeded')
                sha1.update(chunk); sha256.update(chunk); out.write(chunk)
        if size != expected_size or sha1.hexdigest() != expected_sha1:
            raise RuntimeError('Android archive metadata mismatch')
        destination.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as package:
            members = package.infolist()
            if len(members) > 50000 or sum(member.file_size for member in members) > 8 * 1024**3:
                raise RuntimeError('Android archive expansion limit exceeded')
            for member in members:
                target = destination / member.filename
                if not target.resolve().is_relative_to(destination.resolve()):
                    raise RuntimeError('Android archive path escaped destination')
                if member.is_dir():
                    continue
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode):
                    link = package.read(member).decode('utf-8')
                    if Path(link).is_absolute() or not (target.parent / link).resolve().is_relative_to(destination.resolve()):
                        raise RuntimeError('Android archive symlink escaped destination')
                    target.parent.mkdir(parents=True, exist_ok=True); target.symlink_to(link)
                else:
                    package.extract(member, destination)
                    # AIDEV-NOTE: Preserve native executable bits and contained symlinks omitted by zipfile extraction.
                    target.chmod(mode & 0o777 or 0o644)
        archive.unlink()
        records.append({'url': url, 'size': size, 'sha1': expected_sha1, 'sha256': sha256.hexdigest()})
    (ROOT / 'artifact-lock.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    main()
