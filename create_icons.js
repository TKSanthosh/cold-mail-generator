const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateIconPng(size) {
  const width = size;
  const height = size;
  const rawRows = [];

  for (let y = 0; y < height; y++) {
    const row = [0]; // filter type 0: none
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      const cx = (x - width / 2) / (width / 2);
      const cy = (y - height / 2) / (height / 2);
      const dist = Math.sqrt(cx * cx + cy * cy);

      if (dist <= 0.95) {
        let r = Math.round(99 + 50 * ny);
        let g = Math.round(102 - 10 * nx);
        let b = Math.round(241 + 10 * ny);
        let a = 255;

        // Inner document / resume glyph
        const inDocX = nx >= 0.28 && nx <= 0.72;
        const inDocY = ny >= 0.22 && ny <= 0.78;
        if (inDocX && inDocY) {
          r = 255;
          g = 255;
          b = 255;
          if ((ny >= 0.35 && ny <= 0.40 && nx <= 0.65) ||
              (ny >= 0.46 && ny <= 0.51 && nx <= 0.62) ||
              (ny >= 0.57 && ny <= 0.62 && nx <= 0.55) ||
              (ny >= 0.68 && ny <= 0.73 && nx <= 0.60)) {
            r = 99;
            g = 102;
            b = 241;
          }
        }

        // Lightning bolt accent
        const lx = (nx - 0.70) * 8;
        const ly = (ny - 0.70) * 8;
        if (lx >= -0.8 && lx <= 0.8 && ly >= -0.8 && ly <= 0.8) {
          const inBolt = (ly < 0 && lx > ly * 0.5 && lx < ly * 0.5 + 0.9) ||
                         (ly >= 0 && lx > ly * 0.4 - 0.4 && lx < ly * 0.4 + 0.5);
          if (inBolt) {
            r = 245;
            g = 158;
            b = 11;
          }
        }

        row.push(r, g, b, a);
      } else {
        row.push(0, 0, 0, 0);
      }
    }
    rawRows.push(Buffer.from(row));
  }

  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const outDir = path.join(__dirname, 'extension', 'icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const buf = generateIconPng(size);
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`Generated icon: ${file} (${buf.length} bytes)`);
});
