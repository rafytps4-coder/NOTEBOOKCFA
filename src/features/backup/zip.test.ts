// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ZipError, ZipReader, ZipWriter, crc32Update } from './zip';

const bytes = (s: string) => new TextEncoder().encode(s);

async function build(files: Record<string, string | Blob>, compress = true) {
  const z = new ZipWriter();
  for (const [name, data] of Object.entries(files)) {
    if (typeof data === 'string') await z.addText(name, data, compress);
    else await z.add(name, data);
  }
  return z.toBlob();
}

describe('zip', () => {
  it('known CRC-32 value', () => {
    expect(crc32Update(0, bytes('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips stored and deflated entries, including unicode names', async () => {
    const big = JSON.stringify({
      rows: Array.from({ length: 500 }, (_, i) => ({ i, text: `row ${i} ünï©ode` })),
    });
    const blob = new Blob([Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 253])]);
    const zip = await build({ 'data/big.json': big, 'blobs/ü-1': blob, 'small.txt': 'hi' });
    const r = await ZipReader.open(zip);
    expect(
      r
        .list()
        .map((e) => e.name)
        .sort(),
    ).toEqual(['blobs/ü-1', 'data/big.json', 'small.txt']);
    expect(await r.readText('data/big.json')).toBe(big);
    expect(await r.readText('small.txt')).toBe('hi');
    expect(new Uint8Array(await (await r.readBlob('blobs/ü-1')).arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]),
    );
    await r.verify('blobs/ü-1');
    await r.verify('data/big.json');
    // The big JSON really was compressed
    expect(zip.size).toBeLessThan(big.length);
  });

  it('streams parts to a sink instead of keeping them', async () => {
    const seen: number[] = [];
    const z = new ZipWriter((p) => void seen.push(p instanceof Blob ? p.size : p.length));
    await z.addText('a.txt', 'hello', false);
    z.finish();
    await z.flush();
    expect(seen.length).toBeGreaterThan(2);
    expect(z.parts).toHaveLength(0);
  });

  it('detects a flipped byte in an entry (checksum)', async () => {
    const zip = await build({ 'a.txt': 'some content that will be damaged' }, false);
    const buf = new Uint8Array(await zip.arrayBuffer());
    const at = buf.indexOf(bytes('content')[0]!, 40);
    buf[at] = buf[at]! ^ 0xff;
    const r = await ZipReader.open(new Blob([buf]));
    await expect(r.read('a.txt')).rejects.toThrow(/damaged/);
    await expect(r.verify('a.txt')).rejects.toBeInstanceOf(ZipError);
  });

  it('rejects truncated files, non-zips and tiny files', async () => {
    const zip = await build({ 'a.txt': 'abc'.repeat(100) });
    await expect(ZipReader.open(zip.slice(0, zip.size - 10))).rejects.toBeInstanceOf(ZipError);
    await expect(
      ZipReader.open(new Blob([bytes('this is just some text, not a zip file at all, really')])),
    ).rejects.toThrow(/not a valid archive/);
    await expect(ZipReader.open(new Blob([bytes('tiny')]))).rejects.toThrow(/too small/);
  });

  it('reports a missing entry clearly', async () => {
    const r = await ZipReader.open(await build({ 'a.txt': 'x' }));
    await expect(r.read('nope.txt')).rejects.toThrow(/missing/);
    expect(r.has('a.txt')).toBe(true);
  });
});
