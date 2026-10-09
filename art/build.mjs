// ドット絵の設計図（art_*.mjs）から src/ui/pixel/sprites.ts と icons.ts を作る。
// 使い方: npm run build-art
// Build sprites.ts / icons.ts from art sources (auto outline + mirror).
import fs from 'node:fs';
const { JOBS, ENEMIES, UNKNOWN } = await import('./art_jobs.mjs?' + Date.now()).then(async (a) => ({ ...a, ...(await import('./art_enemies.mjs?' + Date.now())) }));
const { ICONS } = await import('./art_icons.mjs?' + Date.now());
const K = '#0d0b10';
const warn = [];
function process(name, s) {
  if (s.base) return s;
  let rows = s.rows.slice();
  if (s.mirror) rows = rows.map((r) => r + [...r].reverse().join('').slice(s.mirror === 'odd' ? 1 : 0));
  const w = Math.max(...rows.map((r) => r.length));
  rows.forEach((r, i) => { if (r.length !== w) warn.push(`${name} row ${i} len ${r.length} != ${w}`); });
  rows = rows.map((r) => r.padEnd(w, '.'));
  if (s.size) { if (w !== s.size || rows.length !== s.size) warn.push(`${name} size ${w}x${rows.length} != ${s.size}`); }
  const g = rows.map((r) => [...r]);
  if (s.outline !== false) {
    const H = g.length;
    const out = g.map((r) => r.slice());
    for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
      if (g[y][x] !== '.') continue;
      const n = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => { const c = g[y+dy]?.[x+dx]; return c && c !== '.' && c !== 'k'; });
      if (n) out[y][x] = 'k';
    }
    rows = out.map((r) => r.join(''));
  }
  const pal = { k: K, ...s.pal };
  for (const r of rows) for (const c of r) if (c !== '.' && !(c in pal)) warn.push(`${name} missing pal '${c}'`);
  // drop unused pal entries
  const used = new Set(rows.join(''));
  for (const c of Object.keys(pal)) if (!used.has(c)) delete pal[c];
  return { pal, rows };
}
const q = (s) => JSON.stringify(s).replace(/"/g, "'");
function emitSprite(s, indent) {
  const pal = '{ ' + Object.entries(s.pal).map(([k, v]) => `${k}: '${v}'`).join(', ') + ' }';
  return `{\n${indent}  pal: ${pal},\n${indent}  rows: [\n${s.rows.map((r) => `${indent}    '${r}',`).join('\n')}\n${indent}  ],\n${indent}}`;
}
function emitTable(table, varPrefix) {
  const bases = []; const entries = [];
  const done = {};
  for (const [name, s] of Object.entries(table)) done[name] = process(name, s);
  // bases: anything used as base by a recolor gets hoisted to a const
  const baseNames = new Set(Object.values(table).filter((s) => s.base).map((s) => s.base));
  const ids = {}; let n = 0;
  for (const b of baseNames) { ids[b] = `${varPrefix}${n++}`; bases.push(`/** ${b} */\nconst ${ids[b]}: Sprite = ${emitSprite(done[b], '')};`); }
  for (const [name, s] of Object.entries(table)) {
    if (s.base) {
      const pal = '{ ' + Object.entries(s.pal).map(([k, v]) => `${k}: '${v}'`).join(', ') + ' }';
      for (const k of Object.keys(s.pal)) if (!(k in done[s.base].pal)) warn.push(`${name} recolor key '${k}' not in base`);
      entries.push(`  '${name}': recolor(${ids[s.base]}, ${pal}),`);
    } else if (ids[name]) entries.push(`  '${name}': ${ids[name]},`);
    else entries.push(`  '${name}': ${emitSprite(done[name], '  ')},`);
  }
  return { bases, entries, done };
}
const j = emitTable(JOBS, 'JOB_BASE_');
const e = emitTable(ENEMIES, 'SHAPE_');
const u = process('UNKNOWN', UNKNOWN);
let out = `// 自動生成ファイル（直接編集しない）。元は art/art_jobs.mjs・art/art_enemies.mjs。npm run build-art で作り直す。\n// ドット絵の設計図（職業・敵）。'.' は透明、ほかの文字は pal の色。
// 仲間は正面向き、敵は左（仲間の側）向き。ボスは 24〜32 マスの大きな絵。

import { recolor, type Sprite } from './types';

${[...j.bases, ...e.bases].join('\n\n')}

export const JOB_SPRITES: Record<string, Sprite> = {
${j.entries.join('\n')}
};

export const ENEMY_SPRITES: Record<string, Sprite> = {
${e.entries.join('\n')}
};

/** 絵が見つからないときの影 */
export const UNKNOWN_SPRITE: Sprite = ${emitSprite(u, '')};
`;
const DEST = new URL('../src/ui/pixel/', import.meta.url).pathname;
fs.writeFileSync(DEST + 'sprites.ts', out);
const ic = {}; for (const [k, s] of Object.entries(ICONS)) ic[k] = process('icon:' + k, s);
let io = `// 自動生成ファイル（直接編集しない）。元は art/art_icons.mjs。npm run build-art で作り直す。\n// 12x12 の小さなアイコン（地図のマス・持ち物・ステータス）。

import type { Sprite } from './types';

export type IconName =
${Object.keys(ic).map((k) => `  | '${k}'`).join('\n')};

export const ICONS: Record<IconName, Sprite> = {
${Object.entries(ic).map(([k, s]) => `  ${k}: ${emitSprite(s, '  ')},`).join('\n')}
};
`;
fs.writeFileSync(DEST + 'icons.ts', io);
console.log(warn.length ? warn.join('\n') : 'build ok');
