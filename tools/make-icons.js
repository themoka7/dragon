// 렌더러로 PWA 아이콘을 생성한다: NODE_PATH=$(npm root -g) node tools/make-icons.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.join(root, 'gallery.html') + '?n=0');
  for (const size of [192, 512]) {
    const url = await p.evaluate(size => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const bg = ctx.createRadialGradient(size / 2, size * 0.45, 0, size / 2, size / 2, size * 0.7);
      bg.addColorStop(0, '#5b2fa0'); bg.addColorStop(1, '#140a26');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
      const g = DV.data.generateGenome({ seed: 2024, element: 'fire', rarity: 3, body: 'beast' });
      g.wing = 'feather'; g.crest = 'mane';
      DV.render.drawDragon(ctx, g, 3, 1.2, size * 0.47, size * 0.52, size * 1.15, { fit: true, particles: false });
      return c.toDataURL('image/png');
    }, size);
    fs.writeFileSync(path.join(root, 'icons', `icon-${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close();
  console.log('icons written');
})();
