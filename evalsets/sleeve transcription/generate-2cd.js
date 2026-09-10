const sharp = require('sharp');
const out = process.argv[2];
const W = 2400, px = mm => Math.round((mm / 120) * W);
const cd1 = [['1','Ouverture','2:11'],['2','Le Jardin Perdu','4:38'],['3','Symphonie No. 3','6:02'],['4','Interlude','1:47'],['5','La Nuit Blanche','5:23'],['6','Fugue en Ré','3:56']];
const cd2 = [['1','Adagio','7:14'],['2','Marche Funèbre','5:41'],['3','Les Quatre Vents','4:09'],['4','Rondo Final','8:33']];
const list = (tracks, x, y0) => tracks.map((t,i)=>{
  const y = y0 + i*px(4.6);
  return `<text x="${px(x)}" y="${y}" font-size="${px(3.1)}" fill="#eaeaea" font-family="Helvetica">${t[0]}.</text>
          <text x="${px(x+5)}" y="${y}" font-size="${px(3.1)}" fill="#eaeaea" font-family="Helvetica">${t[1]}</text>
          <text x="${px(x+42)}" y="${y}" font-size="${px(3.1)}" fill="#adadad" font-family="Helvetica">${t[2]}</text>`;
}).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}">
 <rect width="100%" height="100%" fill="#101018"/>
 <text x="${px(7)}" y="${px(14)}" font-size="${px(7.5)}" fill="#fff" font-family="Helvetica" font-weight="bold">NOCTURNES COMPLETES</text>
 <text x="${px(7)}" y="${px(22)}" font-size="${px(4.6)}" fill="#c8a44a" font-family="Helvetica">ORCHESTRE DU LEMAN</text>
 <text x="${px(7)}" y="${px(33)}" font-size="${px(3.8)}" fill="#c8a44a" font-family="Helvetica" font-weight="bold">CD 1</text>
 ${list(cd1, 7, px(39))}
 <text x="${px(62)}" y="${px(33)}" font-size="${px(3.8)}" fill="#c8a44a" font-family="Helvetica" font-weight="bold">CD 2</text>
 ${list(cd2, 62, px(39))}
 <text x="${px(7)}" y="${px(108)}" font-size="${px(2.5)}" fill="#9a9a9a" font-family="Helvetica">Lac Records · LR-2219/20 · 2 CD</text>
</svg>`;
sharp(Buffer.from(svg)).jpeg({quality:92}).toFile(out).then(()=>console.log('ok'));
