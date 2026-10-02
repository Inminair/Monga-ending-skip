// 픽셀 아이콘 생성기. 16×16 도트를 그대로 확대해 icons/ 에 PNG 로 저장한다.
// 실행: node tools/make-icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PALETTE = {
  '.': [0, 0, 0, 0],
  O: [0x4a, 0x5b, 0xc4, 255], // 테두리
  S: [0x8d, 0x9a, 0xe0, 255], // 그림자
  T: [0xc7, 0xe4, 0xff, 255], // 제목줄
  Y: [0xff, 0xf6, 0xc4, 255], // 최소화 버튼
  P: [0xff, 0xa9, 0xd6, 255], // 닫기 버튼
  W: [0xff, 0xff, 0xff, 255], // 창 안
  D: [0xff, 0x6f, 0xb5, 255], // ▶▶| 건너뛰기
};

const ART = [
  'OOOOOOOOOOOOOOO.',
  'OTTTTTTTYYTPPTOS',
  'OTTTTTTTYYTPPTOS',
  'OOOOOOOOOOOOOOOS',
  'OWWWWWWWWWWWWWOS',
  'OWWDWWWDWWWDWWOS',
  'OWWDDWWDDWWDWWOS',
  'OWWDDDWDDDWDWWOS',
  'OWWDDDDDDDDDWWOS',
  'OWWDDDDDDDDDWWOS',
  'OWWDDDWDDDWDWWOS',
  'OWWDDWWDDWWDWWOS',
  'OWWDWWWDWWWDWWOS',
  'OWWWWWWWWWWWWWOS',
  'OOOOOOOOOOOOOOOS',
  '.SSSSSSSSSSSSSSS',
];

// 크기별 [배율, 바깥 여백]. 128 은 웹스토어 권장대로 둘레 16px 를 비운다.
const SIZES = { 16: [1, 0], 32: [2, 0], 48: [3, 0], 128: [6, 16] };

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      raw.set(pixelAt(x, y), y * stride + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 비트 깊이
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const [size, [scale, pad]] of Object.entries(SIZES)) {
  const png = encodePng(Number(size), (x, y) => {
    const gx = Math.floor((x - pad) / scale);
    const gy = Math.floor((y - pad) / scale);
    const ch = x < pad || y < pad ? '.' : ART[gy]?.[gx] ?? '.';
    return PALETTE[ch];
  });
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png`);
}
