// Slay the Spire 方式の分かれ道マップを作る。
// 下（スタート）から上（ボス）へ、つながったマスを選んで進む。

import type { Rng } from './rng';

export type NodeType = 'battle' | 'elite' | 'rest' | 'shop' | 'treasure' | 'event' | 'boss';

export const NODE_INFO: Record<NodeType, { label: string; icon: string }> = {
  battle: { label: '戦闘', icon: '⚔️' },
  elite: { label: '強敵', icon: '👹' },
  rest: { label: '休憩所', icon: '🔥' },
  shop: { label: 'ショップ', icon: '🛒' },
  treasure: { label: '宝箱', icon: '🎁' },
  event: { label: 'イベント', icon: '❓' },
  boss: { label: 'ボス', icon: '👑' },
};

export interface MapNode {
  id: string;
  row: number;
  col: number;
  type: NodeType;
  next: string[];
}

export interface FloorMap {
  rows: number; // ボスを除いた段数
  cols: number;
  nodes: MapNode[];
}

/** 「保留」になっているマス数・出現頻度はここで調整する */
export const MAP_CONFIG = {
  rows: 10,
  cols: 5,
  paths: 4,
  weights: { battle: 46, event: 20, elite: 10, rest: 10, shop: 8, treasure: 6 } as Record<Exclude<NodeType, 'boss'>, number>,
  eliteMinRow: 3,
  shopMinRow: 2,
  restMinRow: 3,
};

const id = (r: number, c: number) => `${r}-${c}`;

export function generateMap(rng: Rng): FloorMap {
  const { rows, cols, paths } = MAP_CONFIG;
  const edges = new Set<string>(); // "r-c>r-c"
  const cells = new Set<string>();
  const starts: number[] = [];
  for (let p = 0; p < paths; p++) {
    let c = rng.int(0, cols - 1);
    if (p === 1) while (c === starts[0]) c = rng.int(0, cols - 1);
    starts.push(c);
    cells.add(id(0, c));
    for (let r = 0; r < rows - 1; r++) {
      let d = Math.min(cols - 1, Math.max(0, c + rng.int(-1, 1)));
      // 線が交差しないようにする（交差するなら真上へ）
      for (const e of edges) {
        const [a, b] = e.split('>').map((x) => x.split('-').map(Number));
        if (a[0] !== r) continue;
        if ((a[1] < c && b[1] > d) || (a[1] > c && b[1] < d)) d = c;
      }
      edges.add(`${id(r, c)}>${id(r + 1, d)}`);
      cells.add(id(r + 1, d));
      c = d;
    }
  }
  const nodes = new Map<string, MapNode>();
  for (const cell of cells) {
    const [r, c] = cell.split('-').map(Number);
    nodes.set(cell, { id: cell, row: r, col: c, type: 'battle', next: [] });
  }
  for (const e of edges) {
    const [from, to] = e.split('>');
    nodes.get(from)!.next.push(to);
  }
  const boss: MapNode = { id: 'boss', row: rows, col: Math.floor(cols / 2), type: 'boss', next: [] };
  for (const n of nodes.values()) if (n.row === rows - 1) n.next.push('boss');

  // マスの種類を決める
  const parents = new Map<string, MapNode[]>();
  for (const n of nodes.values()) for (const nx of n.next) parents.set(nx, [...(parents.get(nx) ?? []), n]);
  const sorted = [...nodes.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of sorted) {
    if (n.row === 0) n.type = 'battle';
    else if (n.row === rows - 1) n.type = 'rest';
    else if (n.row === Math.floor(rows / 2)) n.type = 'treasure';
    else {
      const ps = parents.get(n.id) ?? [];
      const options = (Object.entries(MAP_CONFIG.weights) as [Exclude<NodeType, 'boss'>, number][]).filter(([t]) => {
        if (t === 'elite' && n.row < MAP_CONFIG.eliteMinRow) return false;
        if (t === 'shop' && n.row < MAP_CONFIG.shopMinRow) return false;
        if (t === 'rest' && (n.row < MAP_CONFIG.restMinRow || n.row === rows - 2)) return false;
        if (t === 'treasure') return false;
        // 同じ特別マスが続かないように
        if (t !== 'battle' && t !== 'event' && ps.some((p) => p.type === t)) return false;
        return true;
      });
      n.type = rng.weighted(options);
    }
  }
  return { rows, cols, nodes: [...sorted, boss] };
}

export function findNode(map: FloorMap, nodeId: string): MapNode {
  const n = map.nodes.find((x) => x.id === nodeId);
  if (!n) throw new Error(`マス ${nodeId} がありません`);
  return n;
}

/** 今いるマスから次に進めるマス */
export function nextChoices(map: FloorMap, current: string | null): MapNode[] {
  if (current === null) return map.nodes.filter((n) => n.row === 0);
  return findNode(map, current).next.map((i) => findNode(map, i));
}
