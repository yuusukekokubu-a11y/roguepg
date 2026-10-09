// 画面を組み立てるための小さな道具。
// h('div', { class: 'card', onclick: ... }, '中身') のように要素を作る。

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function svg(tag: string, attrs: Record<string, string | number>, ...children: (SVGElement | null)[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(c);
  return el;
}

/** HP・MP・経験値のゲージ（数字つき） */
export function bar(value: number, max: number, kind: 'hp' | 'mp' | 'exp', label = true) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const low = kind === 'hp' && pct <= 30 ? ' low' : '';
  return h(
    'div',
    { class: `bar ${kind}${low}` },
    h('div', { class: 'track' }, h('i', { style: `width:${pct}%` })),
    label ? h('span', null, `${value}/${max}`) : null,
  );
}

/** 選択肢ダイアログ。選ばれた値（キャンセルなら null）を返す */
export function choose<T>(title: string, options: { label: string; value: T; note?: string; disabled?: boolean }[], message?: string): Promise<T | null> {
  return new Promise((resolve) => {
    const close = (v: T | null) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e: Event) => e.target === overlay && close(null) },
      h(
        'div',
        { class: 'win' },
        h('div', { class: 'win-title' }, title),
        message ? h('p', { class: 'win-sub' }, message) : null,
        h(
          'div',
          { class: 'choice-list scroll' },
          options.map((o) =>
            h(
              'button',
              { class: 'menu-item', disabled: o.disabled, onclick: () => close(o.value) },
              h('span', null, o.label),
              o.note ? h('small', null, o.note) : null,
            ),
          ),
        ),
        h('button', { class: 'btn', onclick: () => close(null) }, 'やめる'),
      ),
    );
    document.body.appendChild(overlay);
  });
}

export function toast(text: string) {
  const t = h('div', { class: 'toast win' }, text);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** はい／いいえの確認（ブラウザ標準の confirm は使えない環境があるため自前で出す） */
export async function ask(message: string, yes = 'はい'): Promise<boolean> {
  return (await choose(message, [{ label: yes, value: true }])) === true;
}

/** 数字を 0 から数え上げて表示する（報酬の演出） */
export function countUp(value: number, ms = 600, suffix = ''): HTMLElement {
  const el = h('span', { class: 'count-up' }, `0${suffix}`);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = `${Math.round(value * (1 - Math.pow(1 - t, 3)))}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return el;
}
