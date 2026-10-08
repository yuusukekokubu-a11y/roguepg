// マップの「イベント」マス：選択肢つきの出来事。良いことも悪いことも起きる。

import { ACCESSORIES, ITEMS, SKILLS } from '../data';
import { ENCOUNTERS } from '../data/enemies';
import { characterStats, gainExp } from './character';
import { addToInventory, rngOf, type RunState } from './run';

export interface EventOutcome {
  text: string;
  /** 戦闘になる場合の敵 */
  battle?: string[];
}

export interface EventChoice {
  label: string;
  /** 選べない理由（選べるなら null） */
  disabled?: (run: RunState) => string | null;
  resolve: (run: RunState) => EventOutcome;
}

export interface GameEvent {
  id: string;
  title: string;
  icon: string;
  text: string;
  choices: EventChoice[];
}

const alive = (run: RunState) => run.party.filter((c) => c.hp > 0);
const merchantPrice = (run: RunState) => 30 + run.floor * 20;

export const EVENTS: GameEvent[] = [
  {
    id: 'spring',
    title: '澄んだ泉',
    icon: '💧',
    text: '草むらの奥に、きらきら光る泉がある。',
    choices: [
      {
        label: '水を飲む（全員のHPを30%回復）',
        resolve: (run) => {
          for (const c of alive(run)) {
            const st = characterStats(c);
            c.hp = Math.min(st.hp, c.hp + Math.round(st.hp * 0.3));
          }
          return { text: '冷たい水が体にしみわたる。HPが回復した！' };
        },
      },
      {
        label: '泉の底をさぐる',
        resolve: (run) => {
          const rng = rngOf(run);
          if (rng.chance(0.5)) {
            const name = rng.pick(ITEMS.filter((i) => !i.rare)).name;
            const ok = addToInventory(run, { kind: 'item', name });
            return { text: ok ? `${name} を見つけた！` : `${name} を見つけたが、持ちきれなかった……` };
          }
          for (const c of alive(run)) c.hp = Math.max(1, c.hp - Math.round(characterStats(c).hp * 0.1));
          return { text: '足をすべらせて泉に落ちた！ 全員が少しダメージを受けた。' };
        },
      },
    ],
  },
  {
    id: 'merchant',
    title: 'あやしい行商人',
    icon: '🧳',
    text: '「いい本がありますよ……中身は買ってからのお楽しみ」',
    choices: [
      {
        label: '本を買う（30G＋層×20G）',
        disabled: (run) => (run.gold < merchantPrice(run) ? 'お金が足りない' : null),
        resolve: (run) => {
          const rng = rngOf(run);
          run.gold -= merchantPrice(run);
          const rare = rng.chance(0.4);
          const name = rng.pick(SKILLS.filter((s) => s.rare === rare)).name;
          const ok = addToInventory(run, { kind: 'book', name });
          return { text: `「${name}」の本を手に入れた！${rare ? '（レア本だ！）' : ''}${ok ? '' : ' ……が、持ちきれなかった。'}` };
        },
      },
      { label: '断る', resolve: () => ({ text: '行商人は肩をすくめて去っていった。' }) },
    ],
  },
  {
    id: 'fallen',
    title: '倒れた冒険者',
    icon: '🎒',
    text: '道ばたに冒険者が倒れている。荷物が散らばっている。',
    choices: [
      {
        label: '荷物をあさる',
        resolve: (run) => {
          const rng = rngOf(run);
          if (rng.chance(0.4)) {
            const foes = run.floor === 1 ? ['野盗', '野盗'] : rng.pick(ENCOUNTERS[run.floor].late);
            return { text: '物音に気づいた魔物たちがあらわれた！', battle: foes };
          }
          const name = rng.pick(ITEMS.filter((i) => !i.rare)).name;
          const ok = addToInventory(run, { kind: 'item', name });
          const gold = 20 * run.floor;
          run.gold += gold;
          return { text: `${gold}G と ${name} を手に入れた。${ok ? '' : '（持ちきれなかった）'}` };
        },
      },
      {
        label: '弔う（全員のMPを回復）',
        resolve: (run) => {
          for (const c of alive(run)) {
            const st = characterStats(c);
            c.mp = Math.min(st.mp, c.mp + Math.round(st.mp * 0.5));
          }
          return { text: '静かに祈りをささげた。心が落ち着き、MPが回復した。' };
        },
      },
    ],
  },
  {
    id: 'altar',
    title: '古い祭壇',
    icon: '🗿',
    text: '苔むした祭壇がある。「血を捧げよ」と刻まれている。',
    choices: [
      {
        label: '血を捧げる（主人公のHP25%減）',
        disabled: (run) => (run.party[0].hp <= characterStats(run.party[0]).hp * 0.25 ? 'HPが足りない' : null),
        resolve: (run) => {
          const rng = rngOf(run);
          const hero = run.party[0];
          hero.hp -= Math.round(characterStats(hero).hp * 0.25);
          const name = rng.pick(ACCESSORIES.filter((a) => a.rare === rng.chance(0.25))).name;
          const ok = addToInventory(run, { kind: 'acc', name });
          return { text: `祭壇が光り、アクセサリー「${name}」があらわれた！${ok ? '' : '（持ちきれなかった）'}` };
        },
      },
      { label: '立ち去る', resolve: () => ({ text: '何も起きなかった。' }) },
    ],
  },
  {
    id: 'scarecrow',
    title: '訓練用のかかし',
    icon: '🎯',
    text: '村人が置いていった訓練用のかかしがある。',
    choices: [
      {
        label: '稽古をする（経験値を得る・HP少し減る）',
        resolve: (run) => {
          const exp = 8 + run.floor * 6;
          const ups: string[] = [];
          for (const c of alive(run)) {
            c.hp = Math.max(1, c.hp - Math.round(characterStats(c).hp * 0.1));
            if (gainExp(c, exp) > 0) ups.push(`${c.name}はLv${c.level}になった！`);
          }
          return { text: `汗を流して ${exp} の経験値を得た。${ups.join(' ')}` };
        },
      },
      { label: '先を急ぐ', resolve: () => ({ text: 'かかしに別れを告げた。' }) },
    ],
  },
  {
    id: 'gamble',
    title: '陽気なサイコロ師',
    icon: '🎲',
    text: '「サイコロで勝負しないかい？ 勝てば倍、負ければ没収だ！」',
    choices: [
      {
        label: '30G賭ける',
        disabled: (run) => (run.gold < 30 ? 'お金が足りない' : null),
        resolve: (run) => {
          const rng = rngOf(run);
          if (rng.chance(0.5)) {
            run.gold += 30;
            return { text: 'サイコロの目は6！ 30G もうけた！' };
          }
          run.gold -= 30;
          return { text: 'サイコロの目は1……30G 取られた。' };
        },
      },
      { label: 'やめておく', resolve: () => ({ text: '「つれないねぇ」' }) },
    ],
  },
];

export function pickEvent(run: RunState): GameEvent {
  return rngOf(run).pick(EVENTS);
}
