// Vendored QR Code generator (ES module).
// Pure JavaScript, zero external dependencies.
// Generates SVG QR codes in byte mode with Level L error correction.

// Polynomial Galois Field arithmetic tables for GF(256)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  EXP[i + 255] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
}

function gfMul(x, y) {
  return x === 0 || y === 0 ? 0 : EXP[LOG[x] + LOG[y]];
}

// Reed-Solomon generator polynomials cache
function rsGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const gen = rsGenPoly(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    for (let j = 0; j < ecCount - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    res[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return res;
}

// Version table for Level L error correction: [totalBytes, ecBytes, numBlocks]
// Versions 1 to 10
const VERSION_INFO = [
  null,
  { version: 1, size: 21, totalBytes: 26, ecBytes: 7, blocks: 1 },
  { version: 2, size: 25, totalBytes: 44, ecBytes: 10, blocks: 1 },
  { version: 3, size: 29, totalBytes: 70, ecBytes: 15, blocks: 1 },
  { version: 4, size: 33, totalBytes: 100, ecBytes: 20, blocks: 1 },
  { version: 5, size: 37, totalBytes: 134, ecBytes: 26, blocks: 1 },
  { version: 6, size: 41, totalBytes: 172, ecBytes: 18, blocks: 2 },
  { version: 7, size: 45, totalBytes: 196, ecBytes: 20, blocks: 2 },
  { version: 8, size: 49, totalBytes: 242, ecBytes: 24, blocks: 2 },
  { version: 9, size: 53, totalBytes: 292, ecBytes: 30, blocks: 2 },
  { version: 10, size: 57, totalBytes: 346, ecBytes: 18, blocks: 4 },
];

function chooseVersion(dataLength) {
  // Byte mode header: 4 bits mode + 8 bits length for versions 1-9 (16 bits for 10+)
  for (let v = 1; v < VERSION_INFO.length; v++) {
    const info = VERSION_INFO[v];
    const dataCapacity = info.totalBytes - info.ecBytes * info.blocks;
    const overhead = v < 10 ? 2 : 3;
    if (dataLength + overhead <= dataCapacity) {
      return info;
    }
  }
  throw new Error('Data too long for QR generator');
}

function makeBitBuffer(data, version) {
  const bits = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for v1-9, 16 bits for v10+)
  pushBits(data.length, version < 10 ? 8 : 16);

  // Data bytes
  for (let i = 0; i < data.length; i++) {
    pushBits(data[i], 8);
  }

  return bits;
}

function createMatrix(versionInfo, rawBytes) {
  const size = versionInfo.size;
  const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1));

  function setFinder(r, c) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const isBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        matrix[nr][nc] = (isBorder || isCenter) ? 1 : 0;
      }
    }
  }

  // 1. Finder patterns
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === -1) matrix[6][i] = (i % 2 === 0) ? 1 : 0;
    if (matrix[i][6] === -1) matrix[i][6] = (i % 2 === 0) ? 1 : 0;
  }

  // Dark module
  matrix[size - 8][8] = 1;

  // Format info reserve
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
  }

  // 3. Fill data bits using standard zigzag
  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip timing pattern col
    const left = right - 1;
    for (let count = 0; count < size; count++) {
      const r = upwards ? size - 1 - count : count;
      for (const c of [right, left]) {
        if (matrix[r][c] === -1) {
          const bit = bitIdx < rawBytes.length * 8
            ? (rawBytes[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1
            : 0;
          // Apply mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? bit ^ 1 : bit;
          bitIdx++;
        }
      }
    }
    upwards = !upwards;
  }

  // Format bits for Level L, Mask 0: 0b111011111000100
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  // Write format info around top-left
  const topCols = [0, 1, 2, 3, 4, 5, 7, 8];
  for (let i = 0; i < 6; i++) matrix[8][topCols[i]] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  const topRows = [5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 6; i++) matrix[topRows[i]][8] = formatBits[9 + i];

  // Write format info around bottom-left & top-right
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i];
  for (let i = 0; i < 8; i++) matrix[8][size - 8 + i] = formatBits[7 + i];

  return matrix;
}

/**
 * Encodes text into a raw module matrix.
 * @param {string} text
 * @returns {number[][]}
 */
export function encodeQrMatrix(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const versionInfo = chooseVersion(data.length);
  const dataCapacity = versionInfo.totalBytes - versionInfo.ecBytes * versionInfo.blocks;

  const bits = makeBitBuffer(data, versionInfo.version);

  // Pad terminator (up to 4 bits)
  const padLen = Math.min(4, dataCapacity * 8 - bits.length);
  for (let i = 0; i < padLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad with alternating 0xEC and 0x11
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    dataBytes.push(byte);
  }

  const padBytes = [0xec, 0x11];
  let p = 0;
  while (dataBytes.length < dataCapacity) {
    dataBytes.push(padBytes[p % 2]);
    p++;
  }

  // Interleave and generate EC codewords
  const blockSize = Math.floor(dataCapacity / versionInfo.blocks);
  const ecBlocks = [];
  const rawDataBlocks = [];
  for (let b = 0; b < versionInfo.blocks; b++) {
    const blockData = dataBytes.slice(b * blockSize, (b + 1) * blockSize);
    rawDataBlocks.push(blockData);
    ecBlocks.push(Array.from(rsEncode(new Uint8Array(blockData), versionInfo.ecBytes)));
  }

  const finalBytes = [];
  // Interleave data
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < versionInfo.blocks; b++) {
      finalBytes.push(rawDataBlocks[b][i]);
    }
  }
  // Interleave EC
  for (let i = 0; i < versionInfo.ecBytes; i++) {
    for (let b = 0; b < versionInfo.blocks; b++) {
      finalBytes.push(ecBlocks[b][i]);
    }
  }

  return createMatrix(versionInfo, finalBytes);
}

/**
 * Generates an SVG string representation of a QR code.
 *
 * @param {string} text - Text or token to encode
 * @param {object} [options]
 * @param {number} [options.size=200] - Render width/height in px
 * @param {number} [options.margin=4] - Quiet zone module count
 * @param {string} [options.darkColor='#000000']
 * @param {string} [options.lightColor='#ffffff']
 * @returns {string} SVG markup string
 */
export function generateQrSvg(text, options = {}) {
  const {
    size = 200,
    margin = 4,
    darkColor = '#000000',
    lightColor = '#ffffff',
  } = options;

  const matrix = encodeQrMatrix(text);
  const moduleCount = matrix.length;
  const viewBoxSize = moduleCount + 2 * margin;

  let paths = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (matrix[r][c] === 1) {
        paths += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges" aria-label="QR Code">
  <rect width="100%" height="100%" fill="${lightColor}"/>
  <path d="${paths.trim()}" fill="${darkColor}"/>
</svg>`;
}

// Aliases for convenience
export const createQrSvg = generateQrSvg;
export const generateQrCode = generateQrSvg;
