// 遊び方の説明。タイトルとゲーム中のメニューから開く。項目ごとのタブで切り替える。

import { MAX_ASCENSION } from '../../data/ascension';
import { BALANCE } from '../../engine/balance';
import { NODE_INFO, type NodeType } from '../../engine/map';
import { HEALERS } from '../../engine/run';
import { icon } from '../art';
import { h } from '../dom';
import type { IconName } from '../pixel/icons';

interface Section {
  label: string;
  icon: IconName;
  body: () => (HTMLElement | null)[];
}

const p = (text: string) => h('p', { class: 'guide-p' }, text);
const list = (...items: string[]) => h('ul', { class: 'howto' }, items.map((t) => h('li', null, t)));
const sub = (text: string) => h('div', { class: 'section-title' }, text);

const NODE_TEXT: Record<NodeType, string> = {
  battle: '普通の敵。勝つと経験値・お金と、戦利品を3つの中から1つ',
  elite: '強い敵。そのぶん戦利品が良い（装備は1段階上、アクセサリーも選べる）',
  event: '何が起きるかは行ってみてのお楽しみ。職業や2人の組み合わせで起きるものもある',
  rest: `休む（HP・MPを${Math.round(BALANCE.restRatio * 100)}%回復）か、鍛える（1人の能力値がずっと上がる）。技の整理（無料）もできる`,
  shop: '買う・売る。サービスで「技を忘れさせる」「本の取り寄せ」',
  treasure: 'お金と、中身を3つの中から1つ',
  boss: '層の最後。倒すと次の層へ',
};

const SECTIONS: Section[] = [
  {
    label: '目的',
    icon: 'boss',
    body: () => [
      p('全4層のダンジョンを抜けて、4層の魔王を倒せばクリア。全滅したらそのランは終わり。'),
      list(
        'はじめに主人公の職業と、最初に覚える技を選ぶ',
        `次に、相棒を3人の候補から1人選ぶ（候補には回復役＝${Object.keys(HEALERS).join('・')}が必ず1人いる）`,
        '1層・2層のボスを倒すと仲間が1人増える（最大4人）',
        '3層のボスを倒すと、仲間の代わりに「加護」（パーティー全員にずっと効く恩恵）を選ぶ',
        'HP・MPは戦闘のあとも持ち越し。ボスを倒すと全回復する（アセンション8段以上は半分）',
      ),
      sub('職業の特性'),
      p('職業ごとに、いつも効いている「特性」がある（例：騎士は受けるダメージが減る、盗賊は必ず先手を取る）。職業を選ぶ画面で確認できる。'),
    ],
  },
  {
    label: 'マップ',
    icon: 'event',
    body: () => [
      p('下から上へ、光っているマスを選んで進む。道は分かれていて、どのマスを通るかで展開が変わる。'),
      h(
        'ul',
        { class: 'guide-nodes' },
        (Object.keys(NODE_INFO) as NodeType[]).map((t) => h('li', null, icon(t, 18), h('b', null, NODE_INFO[t].label), h('span', null, NODE_TEXT[t]))),
      ),
      p('ボスの直前は必ず休憩所。HPが減っていたら、強敵を避けて休憩所やイベントを通るのも手。'),
    ],
  },
  {
    label: '戦闘',
    icon: 'battle',
    body: () => [
      list(
        '上の「行動順」の順番に動く。素早いほど番が早く回ってくる',
        '敵の頭の上に「次に何をするか」が出る（攻撃→だれ、全体攻撃、溜め、強化など）。見てから守る・倒す順番を決める',
        '「たたかう」を当てるとMPが少したまる。殴ってためて、技を撃つ',
        '「ぼうぎょ」でその番のダメージ半分。「いれかえ」で前列・後列を入れかえる',
        '後列は近接攻撃を受けにくく、近接攻撃も弱くなる（弓や魔法は関係ない）',
        '敵をタップすると、弱点・効かない状態異常・特徴が見られる',
      ),
      sub('状態異常'),
      list('毒：毎ターン少しずつダメージ。重ねるほど痛い', 'やけど：毎ターンダメージ＋攻撃力ダウン', '混乱：敵味方の区別なく攻撃する', 'スタン：次の1回休み。溜め中の敵に当てると溜めが崩れる'),
      sub('変異個体'),
      p('「狂暴な」「硬化した」などが名前につき、色が違う敵は変異個体。強いぶん、倒すと経験値・お金が多い。'),
    ],
  },
  {
    label: '技と本',
    icon: 'book',
    body: () => [
      p(`技の枠は全員${BALANCE.skillSlots}つ（レベルでは増えない）。本を読むと、その職業の技を覚える。`),
      list(
        '本はその職業の人しか読めない。★はレアな本',
        '枠がいっぱいだと本は読めない。先に技を忘れさせる',
        '技を忘れられる場所：休憩所（無料・何度でも）、ショップ（有料）、イベント「忘却の泉」（無料）',
        `イベント「古の書庫」で、1人の技の枠を増やせる（1人あたり+${BALANCE.maxSlotBonus}まで）`,
        'ショップの「本の取り寄せ」で、職業を指定して本を3冊から1冊選べる',
      ),
    ],
  },
  {
    label: '持ち物',
    icon: 'item',
    body: () => [
      list(
        '戦利品は3つの中から1つ選ぶ（取らないこともできる）',
        `持ち物（どうぐ・本・装備・アクセサリー）はまとめて${BALANCE.inventoryLimit}個まで。いっぱいなら捨てて空ける`,
        '装備は系統ごと（剣士系・魔法系・技巧系・支援系）。「↑ ◯◯より強い」と出たら、その人の強化になる',
        'アクセサリーは1人2つまで。効果とデメリットがあるので組み合わせを考える',
        '持ち物の確認・使う・装備・本を読むは、右上の「メニュー」から',
      ),
    ],
  },
  {
    label: 'やり込み',
    icon: 'skull',
    body: () => [
      p(`クリアすると、その職業の「アセンション」が解放される。最初の技を選ぶ画面で段を選ぶと、より難しい条件で遊べる（全${MAX_ASCENSION}段）。`),
      list('上の段は、下の段の条件をすべて引き継ぐ', 'その段でクリアすると、次の段が解放される', '段ごとの条件は、段を選ぶところの「条件」ボタンで見られる', '解放した段は、全滅しても消えない'),
    ],
  },
];

/** 遊び方の画面を開く（重ねて表示し、閉じると元の画面に戻る） */
export function openGuide(start = 0) {
  let tab = start;
  const overlay = h('div', { class: 'overlay full guide' });
  const render = () => {
    const s = SECTIONS[tab];
    overlay.replaceChildren(
      h(
        'div',
        { class: 'win', style: 'height:100%' },
        h('div', { class: 'map-head' }, h('h2', null, '遊び方'), h('button', { class: 'btn primary small', onclick: () => overlay.remove() }, '閉じる')),
        h(
          'div',
          { class: 'inv-tabs' },
          SECTIONS.map((x, i) => h('button', { class: `chip-tab ${i === tab ? 'active' : ''}`, onclick: () => ((tab = i), render()) }, icon(x.icon, 12), x.label)),
        ),
        h('div', { class: 'scroll grow guide-body' }, h('div', { class: 'win-title' }, s.label), s.body()),
      ),
    );
  };
  render();
  document.body.appendChild(overlay);
}
