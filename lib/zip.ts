import zlib from 'zlib';

export interface ZipEntryInput {
  name: string;
  data: Buffer | string;
}

// Precompute standard IEEE 802.3 CRC-32 lookup table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Builds a standard PKZIP (.zip) archive Buffer in memory using Deflate compression.
 * Compatible with Windows Explorer, macOS Archive Utility, unzip, and Google Drive.
 */
export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localFileChunks: Buffer[] = [];
  const centralDirChunks: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = getDosDateTime();

  for (const entry of entries) {
    const normalizedName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBuf = Buffer.from(normalizedName, 'utf-8');
    const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf-8');

    const crc = crc32(rawBuf);
    const compressedBuf = zlib.deflateRawSync(rawBuf, { level: 6 });

    // Use Deflate (8) when smaller, otherwise Store (0)
    const useDeflate = compressedBuf.length < rawBuf.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? compressedBuf : rawBuf;

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8 filename)
    localHeader.writeUInt16LE(method, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18); // Compressed size
    localHeader.writeUInt32LE(rawBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    localFileChunks.push(localHeader, nameBuf, payload);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8); // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(method, 10); // Compression method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(offset, 42); // Relative offset of local header

    centralDirChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuffer = Buffer.concat(centralDirChunks);

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // Number of central dir records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of central dir records
  eocd.writeUInt32LE(centralDirBuffer.length, 12); // Size of central directory
  eocd.writeUInt32LE(offset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localFileChunks, centralDirBuffer, eocd]);
}
