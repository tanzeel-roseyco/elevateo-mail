"""Read only a pinned ZIP central directory; never install or execute the browser."""
import json
from pathlib import Path
import struct
from urllib.request import Request, urlopen

URL = 'https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip'
SIZE = 198195769

def read_range(start: int, end: int) -> bytes:
    request = Request(URL, headers={'Range': f'bytes={start}-{end}', 'Accept-Encoding': 'identity'})
    with urlopen(request, timeout=30) as response:
        if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{SIZE}':
            raise RuntimeError('Unexpected range response')
        data = response.read(end - start + 2)
    if len(data) != end - start + 1:
        raise RuntimeError('Range length mismatch')
    return data

tail = read_range(SIZE - 65557, SIZE - 1)
offset = tail.rfind(b'PK\x05\x06')
if offset < 0:
    raise RuntimeError('No ZIP end record')
signature, disk, cd_disk, disk_entries, entries, cd_size, cd_offset, comment = struct.unpack_from('<4s4H2IH', tail, offset)
if disk or cd_disk or disk_entries != entries or cd_size > 1048576 or offset + 22 + comment != len(tail):
    raise RuntimeError('Unsupported ZIP central directory')
directory = read_range(cd_offset, cd_offset + cd_size - 1)
members = []
cursor = 0
for _ in range(entries):
    header = struct.unpack_from('<4s6H3I5H2I', directory, cursor)
    if header[0] != b'PK\x01\x02':
        raise RuntimeError('Invalid central directory entry')
    name_size, extra_size, comment_size = header[10:13]
    name = directory[cursor + 46:cursor + 46 + name_size].decode('utf-8')
    members.append({'name': name, 'bytes': header[9], 'mode': oct(header[15] >> 16)})
    cursor += 46 + name_size + extra_size + comment_size
if cursor != len(directory):
    raise RuntimeError('Unparsed central directory bytes')
result = {'url': URL, 'archive_bytes': SIZE, 'entry_count': entries, 'range_bytes_read': len(tail) + len(directory),
          'notice_candidates': [m for m in members if any(part in m['name'].lower() for part in ('license', 'notice', 'credit', 'about'))],
          'members': members, 'scope': 'ZIP metadata only; full archive SHA-256 separately verified in Docker'}
target = Path(__file__).parent / 'output' / 'chrome-archive-members.json'
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: value for key, value in result.items() if key != 'members'}, indent=2))
