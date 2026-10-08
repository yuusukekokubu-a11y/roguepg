// 企画書に書かれた効果の文章（例：「物理ダメージ中＋防御ダウン」）を、
// プログラムが扱える「部品」の配列に変換する。
// 知らない言い回しが出てきたらエラーにするので、テストで全データが読めることを確認できる。

import { BALANCE } from './balance';
import type { Condition, Cost, Effect, ParsedAction, Size, Stat, StatusId, TargetKind } from './types';

const SIZE: Record<string, Size> = { 小: 'small', 中: 'medium', 大: 'large', 特大: 'huge' };

const STAT_WORD: Record<string, Stat[]> = {
  攻撃力: ['atk'],
  防御力: ['def'],
  防御: ['def'],
  魔力: ['mag'],
  精神: ['spr'],
  素早さ: ['spd'],
  最大HP: ['hp'],
  最大MP: ['mp'],
  全ステータス: ['atk', 'def', 'mag', 'spr', 'spd'],
};
const STAT_RE = Object.keys(STAT_WORD)
  .sort((a, b) => b.length - a.length)
  .join('|');

const STATUS_WORD: Record<string, StatusId> = { 毒: 'poison', やけど: 'burn', 混乱: 'confuse', スタン: 'stun' };

export function parseTarget(text: string): TargetKind {
  const map: Record<string, TargetKind> = {
    単体: 'enemy',
    全体: 'enemyAll',
    前列: 'enemyFront',
    ランダム: 'random',
    自分: 'self',
    味方単体: 'ally',
    味方全体: 'allyAll',
    '—': 'none',
    '': 'none',
  };
  const t = map[text];
  if (!t) throw new Error(`対象「${text}」が読めません`);
  return t;
}

export function parseCost(text: string): Cost {
  if (text === 'なし' || text === '') return { kind: 'none' };
  const m = /^(MP|HP)(小|中|大|全部)$/.exec(text);
  if (!m) throw new Error(`コスト「${text}」が読めません`);
  if (m[1] === 'MP') {
    const size = ({ 小: 'small', 中: 'medium', 大: 'large', 全部: 'all' } as const)[m[2] as '小' | '中' | '大' | '全部'];
    return { kind: 'mp', size };
  }
  if (m[2] === '全部') throw new Error('HP全部は使えません');
  return { kind: 'hp', size: ({ 小: 'small', 中: 'medium', 大: 'large' } as const)[m[2] as '小' | '中' | '大'] };
}

const CONDITIONS: [RegExp, Condition][] = [
  [/^状態異常の敵に威力アップ$/, 'targetStatused'],
  [/^毒の敵に威力アップ$/, 'targetPoisoned'],
  [/^毒の敵なら威力特大$/, 'targetPoisonedHuge'],
  [/^自分のHPが(低い|減っている)ほど威力アップ$/, 'selfHpLow'],
  [/^防御力が高いほど威力アップ$/, 'defHigh'],
  [/^素早さが高いほど威力アップ$/, 'spdHigh'],
  [/^HPが少ない敵に威力アップ$/, 'targetHpLow'],
  [/^HPが多い敵に威力アップ$/, 'targetHpHigh'],
  [/^敵の状態異常の数だけ威力アップ$/, 'targetStatusCount'],
  [/^自分にかかった強化の数だけ威力アップ$/, 'selfBuffCount'],
  [/^場に残っている効果の数だけ威力アップ$/, 'lingeringCount'],
  [/^直前に攻撃してきた敵に威力アップ$/, 'lastAttacker'],
  [/^自分のHPが低いほど吸収量アップ$/, 'lifestealSelfHpLow'],
];

/** 文章全体で特別扱いするもの */
const WHOLE: Record<string, Effect[]> = {
  '回避＋反撃（1回）': [{ kind: 'dodgeCounter' }],
  '通常戦闘から逃げる（報酬なし・強敵／ボスには使えない）': [{ kind: 'escape' }],
  '戦闘外で使用。休憩所と同じ効果': [{ kind: 'restAll' }],
  'レベルを1上げる': [{ kind: 'levelUp' }],
};

interface Ctx {
  /** 「（数ターン）」などで決まる継続ターン数。なければ undefined */
  turns: number | undefined;
}

type Rule = [RegExp, (m: RegExpExecArray, ctx: Ctx, out: Effect[]) => void];

function lastDamage(out: Effect[], text: string) {
  const d = [...out].reverse().find((e) => e.kind === 'damage');
  if (!d || d.kind !== 'damage') throw new Error(`「${text}」の前にダメージがありません`);
  return d;
}

const RULES: Rule[] = [
  // ダメージ
  [
    /^(物理＋魔法|物理|魔法)?ダメージ(特大|小|中|大)?(?:×(\d+)(?:〜(\d+))?回)?/,
    (m, _ctx, out) => {
      const type = m[1] === '物理' ? 'physical' : m[1] === '魔法' ? 'magic' : m[1] === '物理＋魔法' ? 'hybrid' : 'fixed';
      const size = m[2] ? SIZE[m[2]] : 'medium';
      const min = m[3] ? Number(m[3]) : 1;
      const max = m[4] ? Number(m[4]) : min;
      out.push({ kind: 'damage', type, size, hits: [min, max] });
    },
  ],
  [/^吸収/, (m, _c, out) => void (lastDamage(out, m.input).lifesteal = true)],
  [/^必ずクリティカル/, (m, _c, out) => void (lastDamage(out, m.input).crit = true)],
  // 回復
  [/^HP・MP全回復/, (_m, _c, out) => out.push({ kind: 'heal', size: 'full' }, { kind: 'mpHeal', size: 'full' })],
  [/^HP全回復/, (_m, _c, out) => out.push({ kind: 'heal', size: 'full' })],
  [/^HP回復(特大|小|中|大)?/, (m, _c, out) => out.push({ kind: 'heal', size: m[1] ? SIZE[m[1]] : 'medium' })],
  [/^MP回復(小|中|大)/, (m, _c, out) => out.push({ kind: 'mpHeal', size: SIZE[m[1]] })],
  [/^蘇生（HPわずか）/, (_m, _c, out) => out.push({ kind: 'revive', hp: 'tiny' })],
  [/^蘇生/, (_m, _c, out) => out.push({ kind: 'revive', hp: 'normal' })],
  // 状態異常
  [/^状態異常を(すべて)?治す/, (_m, _c, out) => out.push({ kind: 'cure', statuses: ['poison', 'burn', 'confuse', 'stun'] })],
  [/^毒を治す/, (_m, _c, out) => out.push({ kind: 'cure', statuses: ['poison'] })],
  [/^やけどを治す/, (_m, _c, out) => out.push({ kind: 'cure', statuses: ['burn'] })],
  [/^混乱・スタンを治す/, (_m, _c, out) => out.push({ kind: 'cure', statuses: ['confuse', 'stun'] })],
  [/^状態異常を防ぐ/, (_m, ctx, out) => out.push({ kind: 'ward', turns: ctx.turns ?? BALANCE.lingeringTurns })],
  [/^強い毒/, (_m, _c, out) => out.push({ kind: 'status', status: 'poison', stacks: 3 })],
  [/^毒を重ねる/, (_m, _c, out) => out.push({ kind: 'status', status: 'poison', stacks: 1 })],
  [/^(毒|やけど|混乱|スタン)(?![をのにが])/, (m, _c, out) => out.push({ kind: 'status', status: STATUS_WORD[m[1]], stacks: 1 })],
  // ステータス
  [
    new RegExp(`^((?:${STAT_RE})(?:＋(?:${STAT_RE}))*)(特大|大)?(アップ|ダウン)(小)?`),
    (m, ctx, out) => {
      const stats = [...new Set(m[1].split('＋').flatMap((w) => STAT_WORD[w]))];
      const b = BALANCE.buff;
      let amount = m[4] ? b.small : m[2] === '特大' ? b.huge : m[2] === '大' ? b.large : b.normal;
      if (m[3] === 'ダウン') amount = -amount;
      out.push({ kind: 'buff', stats, amount, turns: ctx.turns ?? BALANCE.buffTurns });
    },
  ],
  [/^(敵の)?強化を打ち消す/, (_m, _c, out) => out.push({ kind: 'dispel' })],
  // 特殊な動き
  [/^行動順を早める/, (_m, _c, out) => out.push({ kind: 'haste', amount: 1 })],
  [/^行動順を遅らせる/, (_m, _c, out) => out.push({ kind: 'haste', amount: -1 })],
  [/^かばう/, (_m, ctx, out) => out.push({ kind: 'cover', turns: ctx.turns ?? 1 })],
  [/^挑発/, (_m, ctx, out) => out.push({ kind: 'taunt', turns: ctx.turns ?? BALANCE.lingeringTurns })],
  [/^(味方全体に)?反撃(がつく)?/, (_m, ctx, out) => out.push({ kind: 'counter', turns: ctx.turns ?? 1 })],
  [/^回避(大)?アップ/, (m, ctx, out) => out.push({ kind: 'evade', amount: m[1] ? 0.5 : 0.25, turns: ctx.turns ?? BALANCE.buffTurns })],
  [/^受けるダメージ半減/, (_m, ctx, out) => out.push({ kind: 'guard', mul: 0.5, turns: ctx.turns ?? 1 })],
  [/^受けるダメージ軽減/, (_m, ctx, out) => out.push({ kind: 'guard', mul: 0.65, turns: ctx.turns ?? BALANCE.lingeringTurns })],
  [/^攻撃に吸収がつく/, (_m, ctx, out) => out.push({ kind: 'imbue', what: 'lifesteal', turns: ctx.turns ?? BALANCE.lingeringTurns })],
  [/^攻撃に毒がつく/, (_m, ctx, out) => out.push({ kind: 'imbue', what: 'poison', turns: ctx.turns ?? BALANCE.lingeringTurns })],
  [
    /^攻撃に魔法ダメージが上乗せされる/,
    (_m, ctx, out) => out.push({ kind: 'imbue', what: 'magic', turns: ctx.turns ?? BALANCE.lingeringTurns }),
  ],
  // お金・報酬
  [/^(レアな)?アイテムを奪う/, (m, _c, out) => out.push({ kind: 'steal', rare: !!m[1] })],
  [/^お金を得る/, (_m, _c, out) => out.push({ kind: 'gold' })],
  [/^この戦闘の報酬アップ/, (_m, _c, out) => out.push({ kind: 'bonusReward' })],
];

/** 末尾の「（数ターン）」などを取り出す */
function splitDuration(text: string): [string, number | undefined] {
  const m = /（(数ターン|1ターン|戦闘中)）$/.exec(text);
  if (!m) return [text, undefined];
  const turns = m[1] === '1ターン' ? 1 : m[1] === '戦闘中' ? BALANCE.battleLongTurns : BALANCE.lingeringTurns;
  return [text.slice(0, m.index), turns];
}

function parseEffects(text: string, ctx: Ctx): Effect[] {
  const out: Effect[] = [];
  let rest = text;
  let inTick: Effect[] | null = null;
  while (rest.length > 0) {
    rest = rest.replace(/^[＋・]/, '');
    if (rest.startsWith('毎ターン')) {
      rest = rest.slice('毎ターン'.length);
      inTick = [];
      out.push({ kind: 'tick', effects: inTick, turns: ctx.turns ?? BALANCE.lingeringTurns });
    }
    const rule = RULES.find(([re]) => re.test(rest));
    if (!rule) throw new Error(`「${text}」の「${rest}」が読めません`);
    const m = rule[0].exec(rest)!;
    const target: Effect[] = [];
    // 吸収・必ずクリティカルは直前のダメージを書き換えるので、同じ配列に対して実行する
    const dest = /^(吸収|必ずクリティカル)/.test(rest) ? (inTick ?? out) : target;
    rule[1](m, { turns: inTick ? undefined : ctx.turns }, dest);
    for (const e of target) {
      // 毎ターン〜の後ろに続く「毒・やけど・ダメージ」は毎ターンの中身に入れる
      if (inTick && (inTick.length === 0 || e.kind === 'status' || e.kind === 'damage')) inTick.push(e);
      else {
        inTick = null;
        out.push(e);
      }
    }
    rest = rest.slice(m[0].length);
  }
  // 「反撃＋毒」「反撃＋スタン」は、毒・スタン付きの反撃にまとめる
  const counter = out.find((e) => e.kind === 'counter');
  const hasDamage = out.some((e) => e.kind === 'damage');
  if (counter && counter.kind === 'counter' && !hasDamage) {
    const st = out.find((e) => e.kind === 'status');
    if (st && st.kind === 'status') {
      counter.status = st.status;
      out.splice(out.indexOf(st), 1);
    }
  }
  return out;
}

/** 効果の文章を部品に分解する */
export function parseAction(text: string): ParsedAction {
  if (WHOLE[text]) return { effects: structuredClone(WHOLE[text]), conditions: [] };

  // 溜め・連続行動
  const charge = /^溜め：(.*)$/.exec(text);
  if (charge) {
    const body = charge[1];
    const delayed = /^次のターンに(.*)$/.exec(body);
    if (delayed) {
      const inner = parseAction(delayed[1]);
      return { effects: [{ kind: 'delayed', effects: inner.effects }], conditions: inner.conditions };
    }
    const next = /^次の(攻撃|魔法|技)(?:の威力(2倍|アップ)|が必ずクリティカル)(?:＋(.*))?$/.exec(body);
    if (!next) throw new Error(`溜め「${text}」が読めません`);
    const scope = next[1] === '攻撃' ? 'attack' : next[1] === '魔法' ? 'magic' : 'any';
    const effects: Effect[] = [
      next[2] ? { kind: 'charge', mul: next[2] === '2倍' ? 2 : 1.5, scope } : { kind: 'charge', mul: 1, crit: true, scope },
    ];
    if (next[3]) effects.push(...parseEffects(next[3], { turns: undefined }));
    return { effects, conditions: [] };
  }
  const multi = /^連続行動：このターン魔法を(\d)回$/.exec(text);
  if (multi) return { effects: [{ kind: 'multiCast', count: Number(multi[1]) }], conditions: [] };

  const [main, ...conds] = text.split('／');
  const conditions = conds.map((c) => {
    const hit = CONDITIONS.find(([re]) => re.test(c));
    if (!hit) throw new Error(`条件「${c}」が読めません（${text}）`);
    return hit[1];
  });
  const [body, turns] = splitDuration(main);
  return { effects: parseEffects(body, { turns }), conditions };
}
