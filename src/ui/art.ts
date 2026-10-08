// 画面で使う絵（ドット絵・アイコン・背景）の呼び出し口。

import { ICONS, type IconName } from './pixel/icons';
import { pixelImg } from './pixel/render';
import { ENEMY_SPRITES, JOB_SPRITES, UNKNOWN_SPRITE } from './pixel/sprites';
import type { InvEntry } from '../engine/run';
import { equipmentDef } from '../engine/run';

export { floorBackground } from './pixel/backgrounds';

export function jobArt(job: string, size = 28): HTMLImageElement {
  return pixelImg(JOB_SPRITES[job] ?? UNKNOWN_SPRITE, size, job);
}

/** 敵の絵。大きい絵（ボス）は size の倍率をそのまま保つ */
export function enemyArt(name: string, size = 56): HTMLImageElement {
  const s = ENEMY_SPRITES[name] ?? UNKNOWN_SPRITE;
  const scale = Math.max(...s.rows.map((r) => r.length)) / 16;
  return pixelImg(s, Math.round(size * scale), name);
}

export function icon(name: IconName, size = 16): HTMLImageElement {
  return pixelImg(ICONS[name], size, '');
}

export function entryIcon(e: InvEntry, size = 18): HTMLImageElement {
  if (e.kind === 'equip') return icon(equipmentDef(e.name).slot === 'weapon' ? 'weapon' : 'armor', size);
  return icon(e.kind, size);
}
