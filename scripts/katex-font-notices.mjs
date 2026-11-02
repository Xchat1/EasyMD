import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function licenseRecords(buffer) {
  const records = new Set();
  for (let i = 0; i < buffer.readUInt16BE(4); i++) {
    const table = 12 + i * 16;
    if (buffer.toString('ascii', table, table + 4) !== 'name') continue;
    const start = buffer.readUInt32BE(table + 8);
    const count = buffer.readUInt16BE(start + 2);
    const strings = start + buffer.readUInt16BE(start + 4);
    for (let j = 0; j < count; j++) {
      const offset = start + 6 + j * 12;
      if (buffer.readUInt16BE(offset + 6) !== 13) continue;
      const platform = buffer.readUInt16BE(offset);
      const length = buffer.readUInt16BE(offset + 8);
      const position = strings + buffer.readUInt16BE(offset + 10);
      const bytes = buffer.subarray(position, position + length);
      const text = platform === 0 || platform === 3
        ? new TextDecoder('utf-16be').decode(bytes)
        : bytes.toString('latin1');
      records.add(text);
    }
  }
  return [...records];
}

export function generateKatexFontNotices(packageDirectory) {
  const fontDirectory = path.join(packageDirectory, 'dist/fonts');
  const notices = new Set();
  for (const filename of readdirSync(fontDirectory).filter((name) => name.endsWith('.ttf')).sort()) {
    const records = licenseRecords(readFileSync(path.join(fontDirectory, filename)));
    if (!records.length || records.some((text) => !text.includes('SIL Open Font License, Version 1.1'))) {
      throw new Error(`Unverified KaTeX font license: ${filename}`);
    }
    for (const record of records) notices.add(record);
  }
  if (!notices.size) throw new Error('No KaTeX font license metadata found.');
  const output = [
    'KaTeX fonts: SIL Open Font License 1.1',
    'The notices below are extracted unchanged from the name-table license records of the installed KaTeX TTF fonts. The corresponding WOFF/WOFF2 fonts carry the same names and license.',
    'Standard license text source: https://raw.githubusercontent.com/spdx/license-list-data/main/text/OFL-1.1.txt',
    ...notices,
    readFileSync(new URL('./licenses/OFL-1.1.txt', import.meta.url), 'utf8').trim(),
    '',
  ].join('\n\n');
  writeFileSync(new URL('./licenses/katex-fonts.OFL.txt', import.meta.url), output);
  return output;
}
