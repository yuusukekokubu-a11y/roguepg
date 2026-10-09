// マップ画面：分かれ道から次のマスを選ぶ。地図の中だけがスクロールする。

import { FLOORS } from '../../data';
import { pickEvent } from '../../engine/events';
import { NODE_INFO, type MapNode, type NodeType } from '../../engine/map';
import { choices, encounterFor, moveTo, openShop, treasure } from '../../engine/run';
import type { App } from '../app';
import { floorBackground, icon } from '../art';
import { h, svg } from '../dom';
import { ICONS } from '../pixel/icons';
import { spriteURL } from '../pixel/render';
import { partyGrid, topBar } from './party';

const ROW_H = 58;
const W = 320;

export function mapScreen(app: App) {
  const run = app.run!;
  const map = run.map;
  const floor = FLOORS[run.floor - 1];
  const H = (map.rows + 1) * ROW_H + 36;
  const pos = (n: MapNode) => {
    const jitter = ((n.row * 7 + n.col * 13) % 5) - 2;
    const x = n.type === 'boss' ? W / 2 : 30 + (n.col * (W - 60)) / (map.cols - 1) + jitter * 3;
    const y = H - 28 - n.row * ROW_H + (n.type === 'boss' ? -4 : jitter * 2);
    return { x, y };
  };
  const next = new Set(choices(run).map((n) => n.id));
  const visited = new Set(run.visited);

  const enter = (n: MapNode) => {
    moveTo(run, n.id);
    switch (n.type) {
      case 'battle':
      case 'elite':
      case 'boss': {
        const enc = encounterFor(run, n);
        app.go({ name: 'battle', enemies: enc.enemies, kind: enc.kind, boss: n.type === 'boss', variants: enc.variants });
        return;
      }
      case 'rest':
        app.go({ name: 'rest' });
        return;
      case 'shop':
        openShop(run);
        app.go({ name: 'shop' });
        return;
      case 'treasure': {
        const t = treasure(run);
        app.go({ name: 'loot', title: '宝箱', text: `宝箱を開けた。${t.gold}G を手に入れた。`, picks: t.picks });
        return;
      }
      case 'event':
        app.go({ name: 'event', pick: pickEvent(run) });
        return;
    }
  };

  const lines: SVGElement[] = [];
  for (const n of map.nodes) {
    for (const id of n.next) {
      const m = map.nodes.find((x) => x.id === id)!;
      const a = pos(n);
      const b = pos(m);
      const walked = visited.has(n.id) && visited.has(m.id);
      lines.push(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `edge ${walked ? 'walked' : ''}` }));
    }
  }
  const nodes = map.nodes.map((n) => {
    const p = pos(n);
    const cls = ['node', n.type, next.has(n.id) ? 'available' : '', visited.has(n.id) ? 'visited' : '', run.current === n.id ? 'current' : ''].join(' ');
    const r = n.type === 'boss' ? 22 : 15;
    const size = n.type === 'boss' ? 32 : 22;
    const g = svg(
      'g',
      { class: cls, transform: `translate(${p.x},${p.y})` },
      svg('rect', { class: 'node-bg', x: -r, y: -r, width: r * 2, height: r * 2 }),
      svg('image', { href: spriteURL(ICONS[n.type as NodeType]), x: -size / 2, y: -size / 2, width: size, height: size, style: 'image-rendering:pixelated' }),
    );
    const title = svg('title', {});
    title.textContent = NODE_INFO[n.type].label;
    g.appendChild(title);
    if (next.has(n.id)) g.addEventListener('click', () => enter(n));
    return g;
  });

  const mapSvg = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg' }, ...lines, ...nodes);
  const scroller = h('div', { class: 'map-scroll scroll' });
  scroller.appendChild(mapSvg);
  // 今いる場所（または次に進めるマス）が見えるようにスクロール
  requestAnimationFrame(() => {
    const focus = map.nodes.find((n) => n.id === run.current) ?? map.nodes.find((n) => next.has(n.id));
    const y = focus ? pos(focus).y : H;
    const scale = scroller.clientWidth / W;
    scroller.scrollTop = Math.max(0, y * scale - scroller.clientHeight * 0.6);
  });

  return h(
    'div',
    { class: 'screen' },
    topBar(app, () => app.go({ name: 'map' })),
    partyGrid(run),
    h('div', { class: 'map-head' }, h('h2', null, `${run.floor}層　${floor.place}`), h('p', { class: 'tip' }, `有利：${floor.builds}`)),
    h('div', { class: 'win map-frame grow' }, h('img', { class: 'px map-bg', src: floorBackground(run.floor), alt: '' }), scroller),
    h(
      'div',
      { class: 'legend' },
      (Object.keys(NODE_INFO) as NodeType[]).map((t) => h('span', null, icon(t, 12), NODE_INFO[t].label)),
    ),
  );
}
