import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const project = fileURLToPath(new URL('../', import.meta.url));
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const exportsBySize = {
  'assets/app-icon-source.png': 1254,
  'assets/app-icon.png': 1024,
  'public/favicon.png': 64,
  'public/apple-touch-icon.png': 180,
  'public/icon-192.png': 192,
  'public/icon-512.png': 512,
  'public/icon-app-192.png': 192,
  'public/icon-app-512.png': 512,
  'public/icon-large-192.png': 192,
  'public/icon-large-512.png': 512,
};

test('the application keeps the original user-selected 3D Md artwork', async () => {
  const source = await readFile(path.join(project, 'assets/app-icon-source.png'));
  assert.equal(createHash('sha256').update(source).digest('hex'), '1dcb2c93b5d0879ac001bd9bc82edf47ba79fa4a0f728dab8056d1d3329f7518', 'The original 3D Md artwork was replaced; an intentional artwork change requires explicit review');
});

function pngSize(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), pngSignature, 'Expected a PNG image');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// Compare decoded pixels, so native sips/iconutil metadata and compression do
// not change the result. The committed icon source and native exports are
// non-interlaced 8-bit PNGs; palette and grayscale variants are supported too.
function rgbaPixels(bytes) {
  const { width, height } = pngSize(bytes);
  assert.equal(bytes[24], 8, 'Icon PNG must use 8-bit channels');
  assert.equal(bytes[28], 0, 'Icon PNG must be non-interlaced');
  const colorType = bytes[25];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  assert(channels, `Unsupported PNG color type: ${colorType}`);
  const data = [];
  let palette, transparency;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    assert(offset + 12 + length <= bytes.length, 'Truncated PNG chunk');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const content = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IDAT') data.push(content);
    if (type === 'PLTE') palette = content;
    if (type === 'tRNS') transparency = content;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  assert.equal(raw.length, height * (stride + 1), 'Unexpected PNG scanline size');
  const scanlines = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert(filter <= 4, `Unknown PNG filter: ${filter}`);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? scanlines[index - channels] : 0;
      const above = y ? scanlines[index - stride] : 0;
      const upperLeft = y && x >= channels ? scanlines[index - stride - channels] : 0;
      const predictor = [0, left, above, Math.floor((left + above) / 2), paeth(left, above, upperLeft)][filter];
      scanlines[index] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const source = i * channels, target = i * 4;
    let r, g, b, a = 255;
    if (colorType === 3) {
      const index = scanlines[source];
      assert(palette && index * 3 + 2 < palette.length, 'Missing PNG palette entry');
      [r, g, b] = palette.subarray(index * 3, index * 3 + 3);
      a = transparency?.[index] ?? 255;
    } else if (colorType === 0 || colorType === 4) {
      r = g = b = scanlines[source];
      if (colorType === 4) a = scanlines[source + 1];
      else if (transparency?.length === 2 && transparency.readUInt16BE(0) === r) a = 0;
    } else {
      [r, g, b] = scanlines.subarray(source, source + 3);
      if (colorType === 6) a = scanlines[source + 3];
      else if (transparency?.length === 6 && transparency.readUInt16BE(0) === r
        && transparency.readUInt16BE(2) === g && transparency.readUInt16BE(4) === b) a = 0;
    }
    // Invisible RGB bytes may be cleared when an image is re-encoded.
    pixels[target] = a ? r : 0;
    pixels[target + 1] = a ? g : 0;
    pixels[target + 2] = a ? b : 0;
    pixels[target + 3] = a;
  }
  return pixels;
}

test('the icon master and all browser/PWA exports retain their required dimensions', async () => {
  for (const [filename, size] of Object.entries(exportsBySize)) {
    const dimensions = pngSize(await readFile(path.join(project, filename)));
    assert.deepEqual(dimensions, { width: size, height: size }, filename);
  }
});

test('the native ICNS contains the full macOS iconset and preserves the 1024px master pixels', { skip: process.platform !== 'darwin' }, async (t) => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'easymd-icon-test-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const iconset = path.join(temporary, 'EasyMD.iconset');
  execFileSync('/usr/bin/iconutil', ['-c', 'iconset', path.join(project, 'assets/app-icon.icns'), '-o', iconset], { stdio: 'pipe' });
  for (const [points, scale] of [[16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]]) {
    const filename = `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`;
    const size = points * scale;
    assert.deepEqual(pngSize(await readFile(path.join(iconset, filename))), { width: size, height: size }, filename);
  }
  const master = await readFile(path.join(project, 'assets/app-icon.png'));
  const largest = await readFile(path.join(iconset, 'icon_512x512@2x.png'));
  const expectedMaster = path.join(temporary, 'original-artwork-1024.png');
  execFileSync('/usr/bin/sips', ['-z', '1024', '1024', path.join(project, 'assets/app-icon-source.png'), '--out', expectedMaster], { stdio: 'pipe' });
  assert(rgbaPixels(master).equals(rgbaPixels(await readFile(expectedMaster))), 'The 1024px master differs from the original 3D Md artwork');
  assert(rgbaPixels(largest).equals(rgbaPixels(master)), 'The ICNS 1024px entry differs from the authoritative master pixels');
});

test('an explicitly selected built application uses the exact committed ICNS', {
  skip: process.platform !== 'darwin' || !process.env.EASYMD_TEST_APP_BUNDLE,
}, async () => {
  const app = path.resolve(process.env.EASYMD_TEST_APP_BUNDLE);
  const declared = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIconFile', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
  assert(declared && path.basename(declared) === declared && !declared.includes('\\'), 'CFBundleIconFile must reference Resources directly');
  const filename = declared.endsWith('.icns') ? declared : `${declared}.icns`;
  assert((await lstat(path.join(app, 'Contents/Resources', filename))).isFile(), 'The bundled icon must be a real resource file');
  assert((await readFile(path.join(app, 'Contents/Resources', filename))).equals(await readFile(path.join(project, 'assets/app-icon.icns'))), 'The built application icon differs from assets/app-icon.icns');
});
