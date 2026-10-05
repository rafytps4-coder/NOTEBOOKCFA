/**
 * Minimal ZIP reader/writer (no dependencies). Supports "stored" and "deflate" entries (deflate
 * through the browser's CompressionStream), ZIP32 only (< 4 GB, < 65,535 entries; we fail loudly
 * beyond that rather than writing a broken file). Blobs are never copied into memory: stored
 * entries are written as Blob references and read back as Blob slices.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const MAX32 = 0xffffffff;
const CHUNK = 4 * 1024 * 1024;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Update(crc: number, bytes: Uint8Array): number {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** CRC-32 of a blob, read in chunks so memory stays flat. */
export async function crc32Blob(blob: Blob): Promise<number> {
  let crc = 0;
  for (let off = 0; off < blob.size; off += CHUNK) {
    crc = crc32Update(crc, new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer()));
  }
  return crc;
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

function u16(n: number) {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

async function streamThrough(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(data as BufferSource).then(() => writer.close());
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export const deflateRaw = (d: Uint8Array) => streamThrough(d, new CompressionStream('deflate-raw'));
export const inflateRaw = (d: Uint8Array) =>
  streamThrough(d, new DecompressionStream('deflate-raw'));

interface Entry {
  name: string;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

/** Assembles a zip as a list of parts (Uint8Array / Blob). Nothing is concatenated in memory. */
export class ZipWriter {
  readonly parts: BlobPart[] = [];
  private entries: Entry[] = [];
  private offset = 0;
  private pending: Promise<void> = Promise.resolve();

  /**
   * With a `sink`, parts are handed over as they are produced (e.g. written to a file on disk)
   * instead of being kept in memory, so very large libraries can be streamed out.
   */
  constructor(private sink?: (part: Uint8Array | Blob) => void | Promise<void>) {}

  private push(part: Uint8Array | Blob) {
    this.offset += part instanceof Blob ? part.size : part.length;
    if (this.sink) {
      const sink = this.sink;
      this.pending = this.pending.then(() => sink(part));
    } else this.parts.push(part as BlobPart);
  }

  /** Wait until every part has been accepted by the sink. */
  async flush(): Promise<void> {
    await this.pending;
  }

  private localHeader(name: Uint8Array, e: Omit<Entry, 'name' | 'offset'>): Uint8Array {
    return Uint8Array.from([
      ...u32(SIG_LOCAL),
      ...u16(20), // version needed
      ...u16(0x0800), // UTF-8 names
      ...u16(e.method),
      ...u16(0), // mod time
      ...u16(0x21), // mod date: 1980-01-01
      ...u32(e.crc),
      ...u32(e.compressedSize),
      ...u32(e.size),
      ...u16(name.length),
      ...u16(0),
      ...name,
    ]);
  }

  /** Add a file. Small text (JSON) can be deflated; binary blobs are stored as-is. */
  async add(
    name: string,
    data: Uint8Array | Blob,
    opts: { compress?: boolean } = {},
  ): Promise<void> {
    if (this.entries.length >= 65534) throw new ZipError('Too many files for this archive format.');
    const nameBytes = enc.encode(name);
    const offset = this.offset;
    if (data instanceof Blob) {
      if (data.size >= MAX32) throw new ZipError(`“${name}” is too large for this archive format.`);
      const crc = await crc32Blob(data);
      this.push(
        this.localHeader(nameBytes, { method: 0, crc, compressedSize: data.size, size: data.size }),
      );
      this.push(data);
      this.entries.push({
        name,
        method: 0,
        crc,
        compressedSize: data.size,
        size: data.size,
        offset,
      });
      return;
    }
    const crc = crc32Update(0, data);
    let method: 0 | 8 = 0;
    let body = data;
    if (opts.compress && data.length > 256 && typeof CompressionStream !== 'undefined') {
      const packed = await deflateRaw(data);
      if (packed.length < data.length) {
        method = 8;
        body = packed;
      }
    }
    this.push(
      this.localHeader(nameBytes, { method, crc, compressedSize: body.length, size: data.length }),
    );
    this.push(body);
    this.entries.push({
      name,
      method,
      crc,
      compressedSize: body.length,
      size: data.length,
      offset,
    });
  }

  addText(name: string, text: string, compress = true) {
    return this.add(name, enc.encode(text), { compress });
  }

  /** Write the central directory and return the finished parts. */
  finish(): BlobPart[] {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const name = enc.encode(e.name);
      this.push(
        Uint8Array.from([
          ...u32(SIG_CENTRAL),
          ...u16(20),
          ...u16(20),
          ...u16(0x0800),
          ...u16(e.method),
          ...u16(0),
          ...u16(0x21),
          ...u32(e.crc),
          ...u32(e.compressedSize),
          ...u32(e.size),
          ...u16(name.length),
          ...u16(0),
          ...u16(0),
          ...u16(0),
          ...u16(0),
          ...u32(0),
          ...u32(e.offset),
          ...name,
        ]),
      );
    }
    const cdSize = this.offset - cdStart;
    if (this.offset >= MAX32)
      throw new ZipError('The archive is too large for this archive format (4 GB limit).');
    this.push(
      Uint8Array.from([
        ...u32(SIG_EOCD),
        ...u16(0),
        ...u16(0),
        ...u16(this.entries.length),
        ...u16(this.entries.length),
        ...u32(cdSize),
        ...u32(cdStart),
        ...u16(0),
      ]),
    );
    return this.parts;
  }

  toBlob(): Blob {
    return new Blob(this.finish(), { type: 'application/zip' });
  }
}

export interface ZipEntryInfo {
  name: string;
  size: number;
}

/** Random-access reader over a Blob/File: only the central directory and requested entries are read. */
export class ZipReader {
  private index = new Map<string, Entry>();

  private constructor(private blob: Blob) {}

  static async open(blob: Blob): Promise<ZipReader> {
    const r = new ZipReader(blob);
    await r.readDirectory();
    return r;
  }

  private async bytes(start: number, end: number): Promise<Uint8Array> {
    if (start < 0 || end > this.blob.size || start > end)
      throw new ZipError('The archive is truncated or damaged.');
    return new Uint8Array(await this.blob.slice(start, end).arrayBuffer());
  }

  private async readDirectory() {
    const size = this.blob.size;
    if (size < 22) throw new ZipError('This file is too small to be an archive.');
    const tailLen = Math.min(size, 22 + 65535);
    const tail = await this.bytes(size - tailLen, size);
    const dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let p = tail.length - 22;
    while (p >= 0 && dv.getUint32(p, true) !== SIG_EOCD) p--;
    if (p < 0) throw new ZipError('This file is not a valid archive (no directory found).');
    const count = dv.getUint16(p + 10, true);
    const cdSize = dv.getUint32(p + 12, true);
    const cdOffset = dv.getUint32(p + 16, true);
    const cd = await this.bytes(cdOffset, cdOffset + cdSize);
    const cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    let q = 0;
    for (let i = 0; i < count; i++) {
      if (q + 46 > cd.length || cv.getUint32(q, true) !== SIG_CENTRAL)
        throw new ZipError('The archive directory is damaged.');
      const method = cv.getUint16(q + 10, true);
      const crc = cv.getUint32(q + 16, true);
      const compressedSize = cv.getUint32(q + 20, true);
      const usize = cv.getUint32(q + 24, true);
      const nameLen = cv.getUint16(q + 28, true);
      const extraLen = cv.getUint16(q + 30, true);
      const commentLen = cv.getUint16(q + 32, true);
      const offset = cv.getUint32(q + 42, true);
      const name = dec.decode(cd.subarray(q + 46, q + 46 + nameLen));
      if (method !== 0 && method !== 8) throw new ZipError(`Unsupported compression in “${name}”.`);
      this.index.set(name, { name, method, crc, compressedSize, size: usize, offset });
      q += 46 + nameLen + extraLen + commentLen;
    }
  }

  list(): ZipEntryInfo[] {
    return [...this.index.values()].map((e) => ({ name: e.name, size: e.size }));
  }

  has(name: string) {
    return this.index.has(name);
  }

  private async dataRange(e: Entry): Promise<[number, number]> {
    const h = await this.bytes(e.offset, e.offset + 30);
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    if (dv.getUint32(0, true) !== SIG_LOCAL) throw new ZipError(`“${e.name}” is damaged.`);
    const start = e.offset + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
    return [start, start + e.compressedSize];
  }

  /** Entry bytes, decompressed and CRC-checked. */
  async read(name: string): Promise<Uint8Array> {
    const e = this.index.get(name);
    if (!e) throw new ZipError(`“${name}” is missing from the archive.`);
    const [s, t] = await this.dataRange(e);
    let data = await this.bytes(s, t);
    if (e.method === 8) data = await inflateRaw(data);
    if (data.length !== e.size || crc32Update(0, data) !== e.crc)
      throw new ZipError(`“${name}” is damaged (checksum mismatch).`);
    return data;
  }

  async readText(name: string): Promise<string> {
    return dec.decode(await this.read(name));
  }

  /** A stored entry as a Blob slice (no copy). Deflated entries are inflated into memory. */
  async readBlob(name: string, type = ''): Promise<Blob> {
    const e = this.index.get(name);
    if (!e) throw new ZipError(`“${name}” is missing from the archive.`);
    if (e.method === 0) {
      const [s, t] = await this.dataRange(e);
      if (t > this.blob.size) throw new ZipError('The archive is truncated or damaged.');
      return this.blob.slice(s, t, type);
    }
    return new Blob([(await this.read(name)) as BlobPart], { type });
  }

  /** Verify an entry's checksum without keeping its data (used to check every blob before importing). */
  async verify(name: string): Promise<void> {
    const e = this.index.get(name);
    if (!e) throw new ZipError(`“${name}” is missing from the archive.`);
    if (e.method === 8) {
      await this.read(name);
      return;
    }
    const [s, t] = await this.dataRange(e);
    if (t > this.blob.size) throw new ZipError('The archive is truncated or damaged.');
    const crc = await crc32Blob(this.blob.slice(s, t));
    if (crc !== e.crc) throw new ZipError(`“${name}” is damaged (checksum mismatch).`);
  }
}
