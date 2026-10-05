// Generates the app icons (an original design: a teal tile with a paper page, ruled lines and a pen
// stroke) as PNGs, using only Node built-ins. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function png(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed-distance shapes, 3x3 supersampled for smooth edges. */
function render(size, { maskable }) {
  const S = 3;
  const out = Buffer.alloc(size * size * 4);
  const teal = [47, 111, 106];
  const paper = [253, 252, 248];
  const line = [190, 205, 215];
  const ink = [214, 40, 40];
  const u = size / 100; // design on a 100-unit grid
  // Maskable icons keep the important part inside the central 80% safe zone and fill the full square.
  const k = maskable ? 0.74 : 0.9;
  const rr = (px, py, cx, cy, hw, hh, r) => {
    const dx = Math.abs(px - cx) - (hw - r);
    const dy = Math.abs(py - cy) - (hh - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  };
  const seg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = (x + (sx + 0.5) / S) / u;
          const py = (y + (sy + 0.5) / S) / u;
          let col = null;
          const tile = maskable ? -1 : rr(px, py, 50, 50, 50, 50, 22);
          if (tile <= 0) {
            col = teal;
            // the page (centred, slightly rotated feel via offset ink stroke)
            const pg = rr(px, py, 50, 50, (29 * k) / 0.9, (35 * k) / 0.9, 5);
            if (pg <= 0) {
              col = paper;
              for (const ly of [38, 50, 62]) {
                const ly2 = 50 + (ly - 50) * (k / 0.9);
                if (
                  Math.abs(py - ly2) < 0.9 &&
                  px > 50 - (22 * k) / 0.9 &&
                  px < 50 + (22 * k) / 0.9
                )
                  col = line;
              }
              // pen stroke
              const d = seg(
                px,
                py,
                50 - (17 * k) / 0.9,
                62 - (8 * k) / 0.9,
                50 + (17 * k) / 0.9,
                40 - (4 * k) / 0.9,
              );
              if (d < (2.6 * k) / 0.9) col = ink;
            }
          }
          if (col) {
            r += col[0];
            g += col[1];
            b += col[2];
            a += 255;
          }
        }
      }
      const n = S * S;
      const i = (y * size + x) * 4;
      const cov = a / (255 * n);
      out[i] = cov ? Math.round(r / (a / 255)) : 0;
      out[i + 1] = cov ? Math.round(g / (a / 255)) : 0;
      out[i + 2] = cov ? Math.round(b / (a / 255)) : 0;
      out[i + 3] = Math.round(cov * 255);
    }
  }
  return png(size, size, out);
}

writeFileSync('public/icon-192.png', render(192, { maskable: false }));
writeFileSync('public/icon-512.png', render(512, { maskable: false }));
writeFileSync('public/icon-maskable-512.png', render(512, { maskable: true }));
writeFileSync('public/apple-touch-icon.png', render(180, { maskable: true })); // iOS rounds the corners itself
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#2f6f6a"/><rect x="21" y="15" width="58" height="70" rx="5" fill="#fdfcf8"/><g stroke="#becdd7" stroke-width="1.8"><path d="M28 38h44M28 50h44M28 62h44"/></g><path d="M33 54L67 36" stroke="#d62828" stroke-width="5.2" stroke-linecap="round"/></svg>\n`,
);
console.log('icons written');
