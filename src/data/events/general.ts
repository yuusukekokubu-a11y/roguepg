// どの層でも起きるイベント。

import { ENCOUNTERS } from '../enemies';
import {
  expAll,
  floorExp,
  gainGold,
  giveAccessory,
  giveBook,
  giveItem,
  healAll,
  hurtAll,
  hurtOne,
  join,
  mpAll,
  needGold,
  needHp,
  payGold,
  type GameEvent,
} from '../../engine/eventKit';

const merchantPrice = (floor: number) => 30 + floor * 20;

export const GENERAL_EVENTS: GameEvent[] = [
  {
    id: 'spring',
    kind: 'general',
    title: '澄んだ泉',
    icon: '💧',
    text: '道の脇に、きらきら光る泉がある。',
    choices: [
      { label: '水を飲む（全員のHPを30%回復）', resolve: ({ run }) => ({ text: join('冷たい水が体にしみわたる。', healAll(run, 0.3)) }) },
      {
        label: '泉の底をさぐる',
        resolve: ({ run, rng }) =>
          rng.chance(0.5) ? { text: giveItem(run, rng) } : { text: join('足をすべらせて泉に落ちた！', hurtAll(run, 0.1)) },
      },
    ],
  },
  {
    id: 'merchant',
    kind: 'general',
    title: 'あやしい行商人',
    icon: '🧳',
    text: '「いい本がありますよ……中身は買ってからのお楽しみ」',
    choices: [
      {
        label: ({ run }) => `${merchantPrice(run.floor)}Gで本を買う（40%でレア本）`,
        disabled: ({ run }) => needGold(run, merchantPrice(run.floor)),
        resolve: ({ run, rng }) => ({ text: join(payGold(run, merchantPrice(run.floor)), giveBook(run, rng, { rare: rng.chance(0.4) })) }),
      },
      { label: '断る', resolve: () => ({ text: '行商人は肩をすくめて去っていった。' }) },
    ],
  },
  {
    id: 'fallen',
    kind: 'general',
    title: '倒れた冒険者',
    icon: '🎒',
    text: '道ばたに冒険者が倒れている。荷物が散らばっている。',
    choices: [
      {
        label: '荷物をあさる（危険かも）',
        resolve: ({ run, rng }) => {
          if (rng.chance(0.4)) {
            const foes = run.floor === 1 ? ['野盗', '野盗'] : rng.pick(ENCOUNTERS[run.floor].late);
            return { text: '物音に気づいた魔物たちがあらわれた！', battle: foes };
          }
          return { text: join(gainGold(run, 20 * run.floor), giveItem(run, rng)) };
        },
      },
      { label: '弔う（全員のMPを50%回復）', resolve: ({ run }) => ({ text: join('静かに祈りをささげた。', mpAll(run, 0.5)) }) },
    ],
  },
  {
    id: 'altar',
    kind: 'general',
    title: '古い祭壇',
    icon: '🗿',
    text: '苔むした祭壇がある。「血を捧げよ」と刻まれている。',
    choices: [
      {
        label: '血を捧げる（主人公のHP25%減）',
        disabled: ({ run }) => needHp(run.party[0], 0.25),
        resolve: ({ run, rng }) => ({ text: join(hurtOne(run.party[0], 0.25), '祭壇が光った！', giveAccessory(run, rng, { rareChance: 0.25 })) }),
      },
      { label: '立ち去る', resolve: () => ({ text: '何も起きなかった。' }) },
    ],
  },
  {
    id: 'scarecrow',
    kind: 'general',
    title: '訓練用のかかし',
    icon: '🎯',
    text: '誰かが置いていった訓練用のかかしがある。',
    choices: [
      { label: '稽古をする（経験値・HP少し減る）', resolve: ({ run }) => ({ text: join(hurtAll(run, 0.1), expAll(run, floorExp(run, 8))) }) },
      { label: '先を急ぐ', resolve: () => ({ text: 'かかしに別れを告げた。' }) },
    ],
  },
  {
    id: 'gamble',
    kind: 'general',
    title: '陽気なサイコロ師',
    icon: '🎲',
    text: '「サイコロで勝負しないかい？ 勝てば倍、負ければ没収だ！」',
    choices: [
      {
        label: ({ run }) => `${20 + run.floor * 10}G賭ける`,
        disabled: ({ run }) => needGold(run, 20 + run.floor * 10),
        resolve: ({ run, rng }) => {
          const bet = 20 + run.floor * 10;
          return rng.chance(0.5) ? { text: join('サイコロの目は6！', gainGold(run, bet)) } : { text: join('サイコロの目は1……', payGold(run, bet)) };
        },
      },
      { label: 'やめておく', resolve: () => ({ text: '「つれないねぇ」' }) },
    ],
  },
  {
    id: 'oblivion',
    kind: 'general',
    title: '忘却の泉',
    icon: '🌫',
    text: '霧の中に、底の見えない泉がある。覗きこむと、覚えた技が水面に浮かんでは消えていく。',
    choices: [
      { label: '水面に技を映す（だれかの技を1つ、無料で忘れる）', resolve: () => ({ text: '水面がゆらぎ、手放す技を待っている。', pick: 'forget' }) },
      { label: '水を飲む（全員のMPを30%回復）', resolve: ({ run }) => ({ text: join('冷たい水で頭が冴えた。', mpAll(run, 0.3)) }) },
      { label: '立ち去る', resolve: () => ({ text: '霧の泉をあとにした。' }) },
    ],
  },
  {
    id: 'archive',
    kind: 'general',
    floors: [2, 3, 4],
    title: '古の書庫',
    icon: '📚',
    text: '崩れた塔の奥に、埃をかぶった書庫が残っていた。読み解けば、より多くの技を身につけられそうだ。ただし、ここの空気は体を蝕む。',
    choices: [
      {
        label: '書を読み解く（1人の技の枠+1。全員のHP-15%）',
        resolve: ({ run }) => ({ text: join('夜を徹して古い書を読み解いた。', hurtAll(run, 0.15)), pick: 'slot' }),
      },
      { label: '立ち去る', resolve: () => ({ text: '書庫には手をつけずに立ち去った。' }) },
    ],
  },
];
