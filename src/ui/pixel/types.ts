// ドット絵の形式。
// rows は文字の設計図。'.' は透明、それ以外の1文字が pal の色に対応する。
export interface Sprite {
  pal: Record<string, string>;
  rows: string[];
}

/** 色だけ差し替えた別の絵を作る（同じ形の色ちがい） */
export function recolor(base: Sprite, pal: Record<string, string>): Sprite {
  return { pal: { ...base.pal, ...pal }, rows: base.rows };
}
