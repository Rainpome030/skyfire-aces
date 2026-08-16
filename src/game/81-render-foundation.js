// ---------- drawing ----------
const renderCache = { w: 0, h: 0, dpr: 0, theme: null, water: null, sun: null };

function ensureRenderCache(theme) {
  if (renderCache.w === W && renderCache.h === H && renderCache.dpr === DPR && renderCache.theme === theme && renderCache.water && renderCache.sun) return;
  renderCache.w = W; renderCache.h = H; renderCache.dpr = DPR; renderCache.theme = theme;
  const makeLayer = () => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * DPR)); c.height = Math.max(1, Math.round(H * DPR)); const g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); return { c, g }; };
  const water = makeLayer();
  const wg = water.g;
  const grad = wg.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, theme.waterTop); grad.addColorStop(1, theme.waterBottom);
  wg.fillStyle = grad; wg.fillRect(0, 0, W, H);
  renderCache.water = water.c;
  const sun = makeLayer();
  const sg = sun.g, sx = W * 0.78, sy = H * 0.16;
  const glow = sg.createRadialGradient(sx, sy, 0, sx, sy, 220);
  glow.addColorStop(0, theme.sun); glow.addColorStop(0.25, theme.sunGlow); glow.addColorStop(1, 'rgba(255,255,255,0)');
  sg.fillStyle = glow; sg.beginPath(); sg.arc(sx, sy, 220, 0, TAU); sg.fill();
  sg.fillStyle = theme.sun; sg.beginPath(); sg.arc(sx, sy, 34, 0, TAU); sg.fill();
  renderCache.sun = sun.c;
}

function prewarmRender() {
  // drawIslands 使用岛屿 seed 的局部 RNG；完整预热不会消费玩法 Math.random 序列。
  ensureRenderCache(world.theme);
  draw();
}

function drawWater(theme) {
  ensureRenderCache(theme);
  ctx.drawImage(renderCache.water, 0, 0, W, H);
  ctx.strokeStyle = theme.wave;
  ctx.lineWidth = 1;
  const step = 56;
  for (let y = -40; y < H + 60; y += step) {
    const wy = y + gameTime * 8 % step;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 28) {
      const yy = wy + Math.sin(x * 0.012 + gameTime * 1.4 + wy) * 4;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function drawIslandPoly(pts, fill) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawIslands() {
  const viewR = Math.hypot(W, H) / cam.zoom + 500;
  for (const isl of world.islands) {
    if (Math.abs(isl.cx - cam.x) > viewR || Math.abs(isl.cy - cam.y) > viewR) continue;
    const t = world.theme;
    const sand = isl.pts.map(p => ({ x: p.x * 1.045, y: p.y * 1.045 }));
    drawIslandPoly(sand, t.sand);
    drawIslandPoly(isl.pts, t.grass);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const r = seeded(Math.floor(isl.seed * 10000));
    const treeN = Math.floor(isl.rad / 55) + 3;
    for (let i = 0; i < treeN; i++) {
      const a = r() * TAU, rr = r() * isl.rad * 0.7;
      const tx = isl.cx + Math.cos(a) * rr, ty = isl.cy + Math.sin(a) * rr;
      ctx.fillStyle = t.tree;
      ctx.beginPath();
      ctx.arc(tx, ty, 7 + r() * 7, 0, TAU);
      ctx.fill();
    }
    if (isl.city && t.city) {
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, rr = r() * isl.rad * 0.72;
        const bx = isl.cx + Math.cos(a) * rr, by = isl.cy + Math.sin(a) * rr;
        ctx.fillStyle = t.city;
        ctx.globalAlpha = 0.35 + r() * 0.6;
        ctx.fillRect(bx, by, 5, 5);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawClouds() {
  const viewR = Math.hypot(W, H) / cam.zoom + 500;
  for (const c of world.clouds) {
    if (Math.abs(c.x - cam.x) > viewR || Math.abs(c.y - cam.y) > viewR) continue;
    const x = c.x + gameTime * c.drift;
    const g = ctx.createRadialGradient(x, c.y, 0, x, c.y, c.r);
    g.addColorStop(0, world.theme.cloud);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.globalAlpha = c.alpha;
    ctx.beginPath();
    ctx.ellipse(x, c.y, c.r * 1.7, c.r * 0.72, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawSun() {
  const t = world.theme;
  ensureRenderCache(t);
  ctx.drawImage(renderCache.sun, 0, 0, W, H);
}
