// ドット絵（文字の設計図）を画像のURLにする。一度作った画像は使い回す。

import type { Sprite } from './types';

const cache = new WeakMap<Sprite, string>();

export function spriteURL(s: Sprite): string {
  const hit = cache.get(s);
  if (hit) return hit;
  const h = s.rows.length;
  const w = Math.max(...s.rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  s.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      ctx.fillStyle = s.pal[ch] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  const url = cv.toDataURL();
  cache.set(s, url);
  return url;
}

/** <img> を作る。size はCSSでの表示の大きさ（px） */
export function pixelImg(s: Sprite, size: number, alt = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'px';
  img.src = spriteURL(s);
  img.alt = alt;
  img.width = size;
  img.height = Math.round((size * s.rows.length) / Math.max(...s.rows.map((r) => r.length)));
  img.draggable = false;
  return img;
}
