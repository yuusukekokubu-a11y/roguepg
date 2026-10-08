// マップ画面：分かれ道から次のマスを選ぶ。

import { FLOORS } from '../../data';
import { pickEvent } from '../../engine/events';
import { NODE_INFO, type MapNode } from '../../engine/map';
import { choices, encounterFor, moveTo, openShop, treasure } from '../../engine/run';
import type { App } from '../app';
import { h, svg } from '../dom';
import { partyBar } from './party';

const ROW_H = 74;
const W = 420;

export function mapScreen(app: App) {
  const run = app.run!;
  const map = run.map;
  const floor = FLOORS[run.floor - 1];
  const H = (map.rows + 1) * ROW_H + 40;
  const pos = (n: MapNode) => {
    const jitter = ((n.row * 7 + n.col * 13) % 5) - 2;
    const x = n.type === 'boss' ? W / 2 : 40 + (n.col * (W - 80)) / (map.cols - 1) + jitter * 4;
    const y = H - 36 - n.row * ROW_H + (n.type === 'boss' ? -6 : jitter * 3);
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
        app.go({ name: 'battle', enemies: enc.enemies, kind: enc.kind, boss: n.type === 'boss' });
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
        app.go({ name: 'loot', title: '🎁 宝箱', text: `宝箱を開けた！ ${t.gold}G を手に入れた。`, drops: t.drops });
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
    const r = n.type === 'boss' ? 30 : 20;
    const g = svg(
      'g',
      { class: cls, transform: `translate(${p.x},${p.y})` },
      svg('circle', { r }),
      (() => {
        const t = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': n.type === 'boss' ? 28 : 20 });
        t.textContent = NODE_INFO[n.type].icon;
        return t;
      })(),
    );
    const title = svg('title', {});
    title.textContent = NODE_INFO[n.type].label;
    g.appendChild(title);
    if (next.has(n.id)) g.addEventListener('click', () => enter(n));
    return g;
  });

  const mapSvg = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg' }, ...lines, ...nodes);
  const wrap = h('div', { class: `map-wrap floor-${run.floor}` });
  wrap.appendChild(mapSvg);
  // 今いる場所が見えるようにスクロール
  requestAnimationFrame(() => {
    const cur = run.current ? map.nodes.find((n) => n.id === run.current) : null;
    const y = cur ? pos(cur).y : H;
    const scale = wrap.clientWidth / W;
    window.scrollTo({ top: Math.max(0, wrap.offsetTop + y * scale - window.innerHeight * 0.65) });
  });

  return h(
    'div',
    { class: 'screen' },
    partyBar(app, () => app.go({ name: 'map' })),
    h(
      'div',
      { class: 'floor-head' },
      h('h2', null, `${run.floor}層：${floor.place}`),
      h('p', { class: 'muted small' }, floor.feature),
      h('p', { class: 'small tip' }, `有利なビルド：${floor.builds}`),
    ),
    h('p', { class: 'hint' }, next.size > 0 ? '光っているマスを選んで進もう' : ''),
    wrap,
    h(
      'div',
      { class: 'legend' },
      Object.values(NODE_INFO).map((i) => h('span', null, `${i.icon} ${i.label}`)),
    ),
  );
}
