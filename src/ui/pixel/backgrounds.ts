// 戦場の背景。96×84マスの低い解像度で描いて、画面では拡大して表示する。
// 1層：黄昏の草原 / 2層：夜の雪原 / 3層：火山 / 4層：魔王の城

const W = 96;
const H = 84;

function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
}

type Ctx = CanvasRenderingContext2D;

function setup(): [HTMLCanvasElement, Ctx, (x: number, y: number, col: string) => void] {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const px = (x: number, y: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x, y, 1, 1);
  };
  return [cv, c, px];
}

/** 上から色の帯を重ね、境目は市松模様でぼかす */
function bands(px: (x: number, y: number, col: string) => void, colors: string[], y0: number, y1: number) {
  for (let y = y0; y < y1; y++) {
    const t = ((y - y0) / (y1 - y0)) * colors.length;
    const band = Math.min(colors.length - 1, Math.floor(t));
    const next = Math.min(colors.length - 1, band + 1);
    for (let x = 0; x < W; x++) px(x, y, t % 1 > 0.65 && (x + y) % 2 === 0 ? colors[next] : colors[band]);
  }
}

function ridge(c: Ctx, base: number, amp: number, freq: number, color: string, phase: number, jag = 0, rnd?: () => number) {
  c.fillStyle = color;
  for (let x = 0; x < W; x++) {
    const j = jag && rnd ? Math.floor(rnd() * jag) : 0;
    const top = Math.round(base - amp * (0.5 + 0.5 * Math.sin(x * freq + phase)) - j);
    c.fillRect(x, top, 1, H - top);
  }
}

function ground(px: (x: number, y: number, col: string) => void, rnd: () => number, colors: string[], y0: number) {
  for (let y = y0; y < H; y++) {
    const depth = (y - y0) / (H - y0);
    for (let x = 0; x < W; x++) {
      const base = Math.min(colors.length - 1, Math.floor(depth * colors.length));
      px(x, y, colors[rnd() < 0.2 ? Math.min(colors.length - 1, base + 1) : base]);
    }
  }
}

function stars(px: (x: number, y: number, col: string) => void, rnd: () => number, n: number, maxY: number) {
  for (let i = 0; i < n; i++) px(Math.floor(rnd() * W), Math.floor(rnd() * maxY), rnd() < 0.3 ? '#c9c2d8' : '#5e5878');
}

function moon(px: (x: number, y: number, col: string) => void, mx: number, my: number, light: string, dark: string, shade: string) {
  for (let y = -5; y <= 5; y++)
    for (let x = -5; x <= 5; x++) {
      const d = x * x + y * y;
      if (d > 25) continue;
      px(mx + x, my + y, d > 16 ? dark : light);
      if ((x + 2) * (x + 2) + (y - 1) * (y - 1) <= 9) px(mx + x, my + y, shade);
    }
}

function fog(px: (x: number, y: number, col: string) => void, rnd: () => number, y0: number, y1: number, col: string) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if ((x + y * 3) % 4 === 0 && rnd() < 0.55) px(x, y, col);
}

// ───────── 1層：黄昏の草原 ─────────
function grassland(): string {
  const [cv, c, px] = setup();
  const rnd = seeded(11);
  const horizon = 44;
  bands(px, ['#100d1b', '#151124', '#1c1530', '#251a36', '#341f3a', '#4a2638', '#633034'], 0, horizon);
  stars(px, rnd, 22, 24);
  moon(px, 66, 14, '#d8d2c0', '#a9a497', '#bdb6a3');
  for (let x = 0; x < W; x++) if ((x * 7) % 3 !== 0) px(x, horizon - 1, '#9a4a38');
  ridge(c, horizon + 1, 6, 0.08, '#1d1824', 1.4);
  ridge(c, horizon + 4, 4, 0.15, '#171a1d', 0.4);
  ground(px, rnd, ['#1f2b22', '#19241c', '#131b15'], horizon + 4);
  for (let i = 0; i < 45; i++) {
    const x = Math.floor(rnd() * W);
    const y = horizon + 7 + Math.floor(rnd() * (H - horizon - 9));
    px(x, y, '#2e3d2c');
    px(x, y + 1, '#2e3d2c');
    px(x + 1, y + 1, '#26331f');
  }
  // 枯れ木
  c.fillStyle = '#0d0b10';
  c.fillRect(9, horizon - 12, 2, 18);
  c.fillRect(5, horizon - 10, 4, 1);
  c.fillRect(4, horizon - 12, 1, 2);
  c.fillRect(11, horizon - 8, 5, 1);
  c.fillRect(15, horizon - 11, 1, 3);
  c.fillRect(7, horizon - 15, 1, 4);
  c.fillRect(11, horizon - 14, 1, 3);
  c.fillRect(12, horizon - 16, 1, 2);
  // 茂みと赤い目
  const bush = (bx: number, by: number) => {
    c.fillStyle = '#0f1510';
    c.fillRect(bx, by, 9, 3);
    c.fillRect(bx + 1, by - 1, 7, 1);
    c.fillRect(bx + 3, by - 2, 3, 1);
  };
  bush(82, horizon + 6);
  px(85, horizon + 6, '#c02828');
  px(87, horizon + 6, '#c02828');
  bush(2, horizon + 9);
  fog(px, rnd, horizon + 3, horizon + 9, 'rgba(150, 130, 170, 0.18)');
  return cv.toDataURL();
}

// ───────── 2層：夜の雪原 ─────────
function snowfield(): string {
  const [cv, c, px] = setup();
  const rnd = seeded(23);
  const horizon = 42;
  bands(px, ['#070a14', '#0b1020', '#10182c', '#172238', '#1f2d44', '#2a3a52'], 0, horizon);
  stars(px, rnd, 30, 26);
  moon(px, 22, 12, '#dfe6f0', '#9fb0c4', '#c3cfdc');
  // 雪をかぶった山
  ridge(c, horizon - 2, 14, 0.11, '#1b2436', 2.1, 2, rnd);
  for (let x = 0; x < W; x++) {
    // 山頂の雪
    const top = Math.round(horizon - 2 - 14 * (0.5 + 0.5 * Math.sin(x * 0.11 + 2.1)));
    if (top < horizon - 9) {
      px(x, top, '#8ea3bf');
      if (rnd() < 0.6) px(x, top + 1, '#62758f');
    }
  }
  ridge(c, horizon + 3, 4, 0.17, '#2a3850', 0.7);
  ground(px, rnd, ['#5d6f8a', '#4c5c76', '#3c4a62', '#2f3b50'], horizon + 3);
  // 凍った枯れ木と氷柱の岩
  c.fillStyle = '#0d0f18';
  c.fillRect(80, horizon - 9, 2, 14);
  c.fillRect(77, horizon - 6, 3, 1);
  c.fillRect(82, horizon - 4, 4, 1);
  c.fillRect(84, horizon - 7, 1, 3);
  for (let i = 0; i < 4; i++) px(78 + i * 2, horizon - 5, '#a9c4e0');
  c.fillStyle = '#26324a';
  c.fillRect(4, horizon + 6, 10, 4);
  c.fillRect(6, horizon + 4, 6, 2);
  // 吹雪：斜めに流れる雪
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(rnd() * H);
    px(x, y, rnd() < 0.3 ? '#e8eef7' : 'rgba(220, 230, 245, 0.45)');
    if (rnd() < 0.3) px(x + 1, y + 1, 'rgba(220, 230, 245, 0.3)');
  }
  fog(px, rnd, horizon + 2, horizon + 10, 'rgba(180, 200, 230, 0.15)');
  return cv.toDataURL();
}

// ───────── 3層：火山 ─────────
function volcano(): string {
  const [cv, c, px] = setup();
  const rnd = seeded(37);
  const horizon = 44;
  bands(px, ['#0e0606', '#180909', '#240c0b', '#36120e', '#4e1a10', '#6a2412'], 0, horizon);
  // 煙
  for (let i = 0; i < 70; i++) {
    const x = 30 + Math.floor(rnd() * 40);
    const y = Math.floor(rnd() * 26);
    px(x, y, 'rgba(40, 30, 30, 0.6)');
  }
  // 火山（真ん中奥）と火口の光
  c.fillStyle = '#1a0d0b';
  for (let x = 0; x < W; x++) {
    const d = Math.abs(x - 50);
    const top = Math.round(horizon - Math.max(0, 22 - d * 0.6));
    c.fillRect(x, top, 1, H - top);
  }
  for (let x = 46; x <= 54; x++) {
    px(x, horizon - 22, '#ff7a2a');
    if (rnd() < 0.7) px(x, horizon - 21, '#c0401a');
  }
  // 溶岩が流れる筋
  let lx = 51;
  for (let y = horizon - 21; y < horizon; y++) {
    lx += rnd() < 0.5 ? 0 : rnd() < 0.5 ? -1 : 1;
    px(lx, y, y % 3 === 0 ? '#ffb04a' : '#e0561e');
  }
  ridge(c, horizon + 2, 5, 0.2, '#140a09', 0.3, 2, rnd);
  ground(px, rnd, ['#231210', '#1a0d0c', '#120909'], horizon + 2);
  // 地面の溶岩の割れ目
  for (let i = 0; i < 6; i++) {
    let x = Math.floor(rnd() * W);
    const y0 = horizon + 8 + Math.floor(rnd() * 24);
    for (let k = 0; k < 10; k++) {
      px(x, y0 + Math.floor(k / 3), k % 2 ? '#ff7a2a' : '#b8361a');
      x += rnd() < 0.5 ? 1 : -1;
    }
  }
  // 舞い上がる火の粉
  for (let i = 0; i < 40; i++) px(Math.floor(rnd() * W), Math.floor(rnd() * H), rnd() < 0.5 ? '#ff9a3d' : '#ffd36a');
  // 下から照らす赤い光
  for (let y = H - 14; y < H; y++)
    for (let x = 0; x < W; x++) if ((x + y) % 3 === 0 && rnd() < 0.4) px(x, y, 'rgba(200, 60, 20, 0.18)');
  return cv.toDataURL();
}

// ───────── 4層：魔王の城 ─────────
function castle(): string {
  const [cv, c, px] = setup();
  const rnd = seeded(53);
  const floorY = 50;
  // 奥の壁：石積み
  for (let y = 0; y < floorY; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor(y / 4);
      const offset = row % 2 ? 4 : 0;
      const joint = y % 4 === 3 || (x + offset) % 8 === 7;
      px(x, y, joint ? '#0c0a12' : rnd() < 0.1 ? '#1c1828' : '#18141f');
    }
  // 窓と赤い月
  c.fillStyle = '#05040a';
  c.fillRect(42, 6, 12, 22);
  c.fillRect(44, 4, 8, 2);
  c.fillRect(46, 3, 4, 1);
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) px(48 + x, 13 + y, x * x + y * y > 5 ? '#7a1a22' : '#b8323a');
  c.fillStyle = '#2a2236';
  c.fillRect(47, 6, 2, 22);
  c.fillRect(42, 16, 12, 1);
  // 柱
  const pillar = (x0: number) => {
    for (let y = 0; y < floorY + 2; y++)
      for (let x = 0; x < 8; x++) px(x0 + x, y, x === 0 || x === 7 ? '#0c0a12' : x < 3 ? '#3a3248' : x < 6 ? '#2b2438' : '#1f1a2a');
    c.fillStyle = '#0c0a12';
    c.fillRect(x0 - 1, 8, 10, 2);
    c.fillRect(x0 - 1, floorY - 2, 10, 2);
  };
  pillar(10);
  pillar(78);
  // 燭台の紫の炎
  const torch = (x: number, y: number) => {
    c.fillStyle = '#0c0a12';
    c.fillRect(x, y, 3, 2);
    px(x + 1, y - 1, '#b07cff');
    px(x + 1, y - 2, '#e0c8ff');
    px(x, y - 1, '#6a3ab8');
    px(x + 2, y - 1, '#6a3ab8');
    for (let dy = -6; dy < 6; dy++)
      for (let dx = -6; dx < 7; dx++) if (dx * dx + dy * dy < 30 && (dx + dy) % 2 === 0 && rnd() < 0.5) px(x + 1 + dx, y + dy, 'rgba(140, 90, 220, 0.12)');
  };
  torch(26, 26);
  torch(67, 26);
  // 床：市松の石畳（奥ほど暗く）
  for (let y = floorY; y < H; y++)
    for (let x = 0; x < W; x++) {
      const tile = (Math.floor(x / 8) + Math.floor((y - floorY) / 5)) % 2;
      const depth = (y - floorY) / (H - floorY);
      px(x, y, tile ? (depth < 0.4 ? '#221c2c' : '#2a2236') : depth < 0.4 ? '#14101a' : '#1a1522');
    }
  // 赤い絨毯
  for (let y = floorY; y < H; y++) {
    const half = 8 + Math.floor((y - floorY) * 0.5);
    for (let x = 48 - half; x < 48 + half; x++) px(x, y, x === 48 - half || x === 48 + half - 1 ? '#c9a54a' : (x + y) % 5 ? '#5e1a1e' : '#4a1418');
  }
  fog(px, rnd, floorY - 2, floorY + 6, 'rgba(120, 80, 160, 0.12)');
  return cv.toDataURL();
}

const cache = new Map<number, string>();
const DRAW: Record<number, () => string> = { 1: grassland, 2: snowfield, 3: volcano, 4: castle };

export function floorBackground(floor: number): string {
  const hit = cache.get(floor);
  if (hit) return hit;
  const url = (DRAW[floor] ?? grassland)();
  cache.set(floor, url);
  return url;
}
