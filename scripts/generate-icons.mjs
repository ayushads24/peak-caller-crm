import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

mkdirSync(publicDir, { recursive: true });

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function createPNG(size, r, g, b, cornerRadius = 0) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const rowSize = 1 + size * 4;
  const raw = Buffer.alloc(size * rowSize, 0);

  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const offset = y * rowSize + 1 + x * 4;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const rad = size / 2;
      const inCircle = Math.sqrt(cx * cx + cy * cy) <= rad - 1;

      // Rounded rect check
      const rx = cornerRadius;
      const inRect =
        x >= rx && x < size - rx && y >= 0 && y < size ||
        x >= 0 && x < size && y >= rx && y < size - rx;
      const inCorner = (dx, dy) => {
        const qx = Math.max(0, dx);
        const qy = Math.max(0, dy);
        return qx * qx + qy * qy <= rx * rx;
      };
      const roundedIn =
        inRect ||
        inCorner(-(x - rx), -(y - rx)) ||
        inCorner(x - (size - rx), -(y - rx)) ||
        inCorner(-(x - rx), y - (size - rx)) ||
        inCorner(x - (size - rx), y - (size - rx));

      if (cornerRadius > 0 ? roundedIn : true) {
        raw[offset] = r;
        raw[offset + 1] = g;
        raw[offset + 2] = b;
        raw[offset + 3] = 255;
      }
    }
  }

  // Draw a simple phone/CRM icon in white
  const iconSize = Math.floor(size * 0.5);
  const iconX = Math.floor((size - iconSize) / 2);
  const iconY = Math.floor((size - iconSize) / 2);

  // Draw white square for icon area (chart bars)
  const barCount = 4;
  const barW = Math.floor(iconSize / (barCount * 2 - 1));
  const maxH = iconSize;
  const heights = [0.4, 0.7, 1.0, 0.6];
  for (let i = 0; i < barCount; i++) {
    const bx = iconX + i * barW * 2;
    const bh = Math.floor(maxH * heights[i]);
    const by = iconY + maxH - bh;
    for (let y = by; y < iconY + maxH; y++) {
      for (let x = bx; x < bx + barW; x++) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const offset = y * rowSize + 1 + x * 4;
          raw[offset] = 255;
          raw[offset + 1] = 255;
          raw[offset + 2] = 255;
          raw[offset + 3] = 255;
        }
      }
    }
  }

  const compressed = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Purple brand color: #7C3AED → rgb(124, 58, 237)
const R = 124, G = 58, B = 237;
const radius = 40;

writeFileSync(join(publicDir, 'pwa-192x192.png'), createPNG(192, R, G, B, radius));
writeFileSync(join(publicDir, 'pwa-512x512.png'), createPNG(512, R, G, B, Math.floor(radius * 512/192)));
writeFileSync(join(publicDir, 'apple-touch-icon.png'), createPNG(180, R, G, B, radius));
writeFileSync(join(publicDir, 'favicon.png'), createPNG(32, R, G, B, 6));

console.log('Icons generated in public/');
