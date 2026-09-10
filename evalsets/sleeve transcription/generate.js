/**
 * Regenerates the fixtures in this directory.
 *
 * They are synthetic on purpose: the ground truth has to be exact for the
 * score to mean anything, and a photograph of a real sleeve would only be as
 * good as our own reading of it. Proportions follow a 120mm jewel case, so
 * the track text is 2mm tall -- 1.7% of the width -- as it is in the hand.
 *
 * Run from backend/ so that sharp resolves:
 *   node '../evalsets/sleeve transcription/generate.js'
 */
const sharp = require('sharp');
const fs = require('fs');
const dir = require('path').join(__dirname);
const path = require('path').join(dir, 'synthetic-back-flat.jpg');

// A CD jewel-case back is 120mm wide. Track text is typically ~2mm tall,
// i.e. 1.7% of the width. Everything below is expressed in those proportions
// so the downscales below mean the same thing they would for a real photo.
const W = 2400, H = 2400 * (120 / 120);
const px = mm => Math.round((mm / 120) * W);

const tracks = [
  ['1', 'Prelude in C Minor', '3:42'],
  ['2', 'The Longest Winter', '5:18'],
  ['3', 'Marchand de Sable', '4:07'],
  ['4', 'Hollow Bones', '2:55'],
  ['5', 'Nocturne for Elise', '6:33'],
  ['6', 'Sept Feuilles', '3:29'],
  ['7', 'Undertow', '4:51'],
  ['8', 'La Chambre Bleue', '5:02'],
  ['9', 'Static Bloom', '3:14'],
  ['10', 'Vesper Song', '7:26'],
  ['11', 'Threadbare', '2:48'],
  ['12', 'Coda (Reprise)', '4:35']
];

const rows = tracks.map((t, i) => {
  const y = px(38) + i * px(5.2);
  return `<text x="${px(8)}" y="${y}" font-size="${px(3.4)}" fill="#e8e8e8" font-family="Helvetica">${t[0]}.</text>
          <text x="${px(14)}" y="${y}" font-size="${px(3.4)}" fill="#e8e8e8" font-family="Helvetica">${t[1]}</text>
          <text x="${px(100)}" y="${y}" font-size="${px(3.4)}" fill="#b0b0b0" font-family="Helvetica">${t[2]}</text>`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#141414"/>
  <text x="${px(8)}" y="${px(16)}" font-size="${px(9)}" fill="#ffffff" font-family="Helvetica" font-weight="bold">ATLAS OF SMALL THINGS</text>
  <text x="${px(8)}" y="${px(25)}" font-size="${px(5.5)}" fill="#d0a020" font-family="Helvetica">THE PAPER KITES ENSEMBLE</text>
  <text x="${px(8)}" y="${px(31)}" font-size="${px(3)}" fill="#909090" font-family="Helvetica">Recorded at Studio Ferber, Paris</text>
  ${rows}
  <text x="${px(8)}" y="${px(106)}" font-size="${px(2.6)}" fill="#a0a0a0" font-family="Helvetica">Harmonia Nova  ·  HN-4471-2  ·  Made in Austria</text>
  <text x="${px(8)}" y="${px(111)}" font-size="${px(2.6)}" fill="#a0a0a0" font-family="Helvetica">℗ 2003 Harmonia Nova GmbH  ·  © 2003</text>
  <rect x="${px(88)}" y="${px(100)}" width="${px(24)}" height="${px(12)}" fill="#ffffff"/>
  <text x="${px(90)}" y="${px(114)}" font-size="${px(2.4)}" fill="#000000" font-family="Helvetica">7 619931 044712</text>
</svg>`;

sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(path).then(() => console.log('written', path));
