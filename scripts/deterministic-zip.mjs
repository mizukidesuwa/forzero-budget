import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

// ZIP32, UTF-8 filenames, fixed DOS date (1980-01-01), no variable metadata.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function writeDeterministicZip(path, base, names) {
  const local = [], central = [];
  let offset = 0;
  for (const name of [...names].sort()) {
    const filename = Buffer.from(name, 'utf8');
    const data = readFileSync(join(base, ...name.split('/')));
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x800, 6); l.writeUInt16LE(8, 8);
    l.writeUInt16LE(0x21, 12); l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(compressed.length, 18); l.writeUInt32LE(data.length, 22);
    l.writeUInt16LE(filename.length, 26);
    local.push(l, filename, compressed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4);
    c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(compressed.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(filename.length, 28); c.writeUInt32LE(0x81a40000, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += l.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(path, Buffer.concat([...local, directory, end]));
}
