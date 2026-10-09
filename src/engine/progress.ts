// ランをまたいで残る記録（アセンションの解放状況）。セーブとは別に保存する。

import { MAX_ASCENSION } from '../data/ascension';

const KEY = 'roguepg-progress-v1';

export interface Progress {
  /** 職業ごとの、選べる一番上の段（0 = まだ通常のみ） */
  ascension: Record<string, number>;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      if (p && typeof p.ascension === 'object') return p;
    }
  } catch {
    // 読めなければ最初から
  }
  return { ascension: {} };
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 保存できない環境では何もしない
  }
}

/** その職業で選べる一番上の段 */
export function unlockedAscension(job: string, p = loadProgress()): number {
  return Math.min(MAX_ASCENSION, p.ascension[job] ?? 0);
}

/**
 * クリアを記録する。いま解放されている一番上の段でクリアしたら、次の段を解放する。
 * 新しく解放された段を返す（解放がなければ null）
 */
export function recordClear(job: string, level: number): number | null {
  const p = loadProgress();
  const cur = unlockedAscension(job, p);
  if (level < cur || cur >= MAX_ASCENSION) return null;
  p.ascension[job] = cur + 1;
  saveProgress(p);
  return cur + 1;
}
