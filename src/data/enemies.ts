// 敵のデータ。名前・特徴は企画書の「敵」シートに合わせている。
// 敵の技もスキルブックと同じ「部品」の文章で書く（parser で読み取る）。

import type { StatusId, TargetKind } from '../engine/types';

export interface EnemyAction {
  name: string;
  effect: string;
  target: TargetKind;
  weight?: number;
}

export interface EnemyDef {
  name: string;
  icon: string;
  floor: number;
  kind: 'normal' | 'elite' | 'boss';
  hp: number;
  atk: number;
  def: number;
  mag: number;
  spr: number;
  spd: number;
  exp: number;
  gold: number;
  immune?: StatusId[];
  weak?: StatusId[];
  /** 状態異常のかかりやすさ（1 = 普通） */
  statusResist?: number;
  actions: EnemyAction[];
  /** 決まった順番で行動する（ボスなど） */
  pattern?: string[];
  /** HPが半分以下になったとき、1回だけ使う技 */
  enrage?: string;
  /** 仲間が倒れると攻撃力アップ */
  packRage?: boolean;
  /** 攻撃でお金を盗む（倒すと取り返せる） */
  stealGold?: number;
  /** 後列に出る */
  back?: boolean;
  /** 回避率（0.3 = 30%） */
  evasion?: number;
  /** 物理攻撃を受けると必ず反撃する（status を付けることも） */
  counter?: { status?: StatusId };
  /** 前列を集中して狙う */
  targetFront?: boolean;
  /** HPが半分以下になったときの変化（第2段階） */
  halfHp?: { text: string; pattern?: string[]; doubleAction?: boolean; immuneAll?: boolean };
}

export const ENEMIES: EnemyDef[] = [
  {
    name: 'スライム',
    icon: '🟢',
    floor: 1,
    kind: 'normal',
    hp: 16,
    atk: 7,
    def: 2,
    mag: 3,
    spr: 2,
    spd: 6,
    exp: 3,
    gold: 3,
    actions: [{ name: '体当たり', effect: '物理ダメージ小', target: 'enemy' }],
  },
  {
    name: '野ウサギ',
    icon: '🐇',
    floor: 1,
    kind: 'normal',
    hp: 17,
    atk: 9,
    def: 3,
    mag: 3,
    spr: 3,
    spd: 15,
    exp: 4,
    gold: 3,
    actions: [{ name: 'かみつき', effect: '物理ダメージ小', target: 'enemy' }],
  },
  {
    name: '大ガラス',
    icon: '🐦‍⬛',
    floor: 1,
    kind: 'normal',
    hp: 21,
    atk: 9,
    def: 3,
    mag: 3,
    spr: 4,
    spd: 10,
    exp: 5,
    gold: 4,
    back: true,
    actions: [{ name: 'つつく', effect: '物理ダメージ小×2回', target: 'random' }],
  },
  {
    name: '毒キノコ',
    icon: '🍄',
    floor: 1,
    kind: 'normal',
    hp: 23,
    atk: 7,
    def: 4,
    mag: 9,
    spr: 4,
    spd: 5,
    exp: 5,
    gold: 4,
    immune: ['poison'],
    actions: [
      { name: '毒の胞子', effect: '物理ダメージ小＋毒', target: 'enemy', weight: 2 },
      { name: '体当たり', effect: '物理ダメージ小', target: 'enemy', weight: 1 },
    ],
  },
  {
    name: '草原オオカミ',
    icon: '🐺',
    floor: 1,
    kind: 'normal',
    hp: 21,
    atk: 10,
    def: 3,
    mag: 3,
    spr: 3,
    spd: 11,
    exp: 5,
    gold: 4,
    packRage: true,
    actions: [{ name: 'かみつき', effect: '物理ダメージ小', target: 'enemy' }],
  },
  {
    name: '野盗',
    icon: '🦹',
    floor: 1,
    kind: 'normal',
    hp: 28,
    atk: 10,
    def: 4,
    mag: 4,
    spr: 4,
    spd: 10,
    exp: 6,
    gold: 10,
    stealGold: 12,
    actions: [
      { name: '盗む', effect: '物理ダメージ小', target: 'enemy', weight: 2 },
      { name: '斬りつけ', effect: '物理ダメージ中', target: 'enemy', weight: 1 },
    ],
  },
  {
    name: '森の大熊',
    icon: '🐻',
    floor: 1,
    kind: 'elite',
    hp: 103,
    atk: 15,
    def: 6,
    mag: 4,
    spr: 5,
    spd: 7,
    exp: 22,
    gold: 30,
    enrage: '怒りの咆哮',
    actions: [
      { name: '強打', effect: '物理ダメージ中', target: 'enemy' },
      { name: '怒りの咆哮', effect: '攻撃力大アップ（戦闘中）', target: 'self', weight: 0 },
    ],
  },
  {
    name: '野盗の用心棒',
    icon: '🧔',
    floor: 1,
    kind: 'elite',
    hp: 90,
    atk: 11,
    def: 9,
    mag: 4,
    spr: 4,
    spd: 8,
    exp: 22,
    gold: 35,
    pattern: ['挑発', '斬る', '反撃の構え', '斬る'],
    actions: [
      { name: '挑発', effect: '挑発', target: 'self' },
      { name: '反撃の構え', effect: '反撃（数ターン）', target: 'self' },
      { name: '斬る', effect: '物理ダメージ中', target: 'enemy' },
    ],
  },
  {
    name: '草原の主（大角獣）',
    icon: '🦬',
    floor: 1,
    kind: 'boss',
    hp: 259,
    atk: 15,
    def: 7,
    mag: 6,
    spr: 6,
    spd: 8,
    exp: 60,
    gold: 80,
    statusResist: 0.6,
    pattern: ['角突き', '踏み鳴らし', '角突き', '大突進'],
    actions: [
      { name: '角突き', effect: '物理ダメージ中', target: 'enemy' },
      { name: '踏み鳴らし', effect: '物理ダメージ小', target: 'enemyAll' },
      { name: '大突進', effect: '溜め：次のターンに物理ダメージ特大', target: 'enemy' },
    ],
  },

  // ───────────── 2層：氷雪地帯（素早さダウンを多用。氷の敵はやけどに弱い） ─────────────
  {
    name: '雪ウサギ', icon: '🐰', floor: 2, kind: 'normal',
    hp: 33, atk: 16, def: 8, mag: 4, spr: 8, spd: 21, exp: 20, gold: 8,
    evasion: 0.3,
    actions: [{ name: 'かみつき', effect: '物理ダメージ小', target: 'enemy' }],
  },
  {
    name: '氷の精', icon: '❄️', floor: 2, kind: 'normal',
    hp: 31, atk: 8, def: 8, mag: 17, spr: 14, spd: 13, exp: 21, gold: 9,
    back: true, weak: ['burn'],
    actions: [{ name: '氷の吐息', effect: '魔法ダメージ小＋素早さダウン', target: 'enemy' }],
  },
  {
    name: '雪狼', icon: '🐺', floor: 2, kind: 'normal',
    hp: 37, atk: 18, def: 9, mag: 4, spr: 8, spd: 15, exp: 21, gold: 8,
    packRage: true, targetFront: true,
    actions: [{ name: 'かみつき', effect: '物理ダメージ小', target: 'enemy' }],
  },
  {
    name: '凍った亡者', icon: '🧟', floor: 2, kind: 'normal',
    hp: 70, atk: 17, def: 10, mag: 6, spr: 8, spd: 8, exp: 25, gold: 10,
    immune: ['poison'], weak: ['burn'],
    actions: [{ name: '凍える手', effect: '物理ダメージ小＋素早さダウン', target: 'enemy' }],
  },
  {
    name: '氷柱コウモリ', icon: '🦇', floor: 2, kind: 'normal',
    hp: 27, atk: 14, def: 7, mag: 4, spr: 8, spd: 16, exp: 20, gold: 8,
    back: true, weak: ['burn'],
    actions: [{ name: '氷柱落とし', effect: '物理ダメージ小×3回', target: 'random' }],
  },
  {
    name: '雪原の小鬼', icon: '👺', floor: 2, kind: 'normal',
    hp: 40, atk: 17, def: 24, mag: 4, spr: 7, spd: 10, exp: 22, gold: 10,
    actions: [{ name: 'こん棒', effect: '物理ダメージ中', target: 'enemy' }],
  },
  {
    name: '雪男', icon: '🦍', floor: 2, kind: 'elite',
    hp: 167, atk: 23, def: 14, mag: 6, spr: 10, spd: 9, exp: 84, gold: 60,
    weak: ['burn'],
    pattern: ['殴る', '殴る', '雪崩'],
    actions: [
      { name: '殴る', effect: '物理ダメージ中', target: 'enemy' },
      { name: '雪崩', effect: '溜め：次のターンに物理ダメージ大', target: 'enemyAll' },
    ],
  },
  {
    name: '氷の魔術師', icon: '🧙', floor: 2, kind: 'elite',
    hp: 123, atk: 10, def: 10, mag: 24, spr: 18, spd: 14, exp: 84, gold: 60,
    back: true, weak: ['burn'],
    pattern: ['吹雪', '氷の槍', '解呪', '氷の槍'],
    actions: [
      { name: '吹雪', effect: '魔法ダメージ小＋素早さダウン', target: 'enemyAll' },
      { name: '解呪', effect: '強化を打ち消す', target: 'enemyAll' },
      { name: '氷の槍', effect: '魔法ダメージ中', target: 'enemy' },
    ],
  },
  {
    name: '氷の女王', icon: '👸', floor: 2, kind: 'boss',
    hp: 336, atk: 17, def: 14, mag: 23, spr: 20, spd: 14, exp: 210, gold: 150,
    weak: ['burn'], statusResist: 0.6,
    pattern: ['吹雪', '氷の槍', '氷の嵐', '氷の槍'],
    halfHp: { text: '氷の女王の魔力が荒れ狂う！（連続で行動するようになった）', doubleAction: true },
    actions: [
      { name: '吹雪', effect: '毎ターン素早さダウン（数ターン）', target: 'enemyAll' },
      { name: '氷の槍', effect: '魔法ダメージ大', target: 'enemy' },
      { name: '氷の嵐', effect: '魔法ダメージ小', target: 'enemyAll' },
    ],
  },

  // ───────────── 3層：火山（やけどを多用。炎の敵はやけど無効。硬い敵・反撃する敵） ─────────────
  {
    name: '火トカゲ', icon: '🦎', floor: 3, kind: 'normal',
    hp: 72, atk: 31, def: 14, mag: 10, spr: 12, spd: 14, exp: 42, gold: 14,
    immune: ['burn'],
    actions: [{ name: '炎の牙', effect: '物理ダメージ小＋やけど', target: 'enemy' }],
  },
  {
    name: '溶岩スライム', icon: '🟠', floor: 3, kind: 'normal',
    hp: 78, atk: 26, def: 14, mag: 10, spr: 10, spd: 8, exp: 42, gold: 14,
    immune: ['burn'], counter: { status: 'burn' },
    actions: [{ name: '体当たり', effect: '物理ダメージ中', target: 'enemy' }],
  },
  {
    name: '火の鳥', icon: '🐦‍🔥', floor: 3, kind: 'normal',
    hp: 58, atk: 22, def: 10, mag: 29, spr: 14, spd: 24, exp: 45, gold: 15,
    back: true, immune: ['burn'],
    actions: [{ name: '火の粉', effect: '魔法ダメージ小＋やけど', target: 'enemyAll' }],
  },
  {
    name: '岩ゴーレム', icon: '🗿', floor: 3, kind: 'normal',
    hp: 104, atk: 34, def: 40, mag: 5, spr: 6, spd: 6, exp: 48, gold: 16,
    immune: ['poison'],
    actions: [{ name: '岩投げ', effect: '物理ダメージ中', target: 'enemy' }],
  },
  {
    name: '火山コウモリ', icon: '🦇', floor: 3, kind: 'normal',
    hp: 58, atk: 29, def: 12, mag: 7, spr: 10, spd: 18, exp: 42, gold: 14,
    actions: [{ name: '吸血', effect: '物理ダメージ中＋吸収', target: 'enemy' }],
  },
  {
    name: '炎の魔導師', icon: '🧙‍♂️', floor: 3, kind: 'normal',
    hp: 72, atk: 12, def: 12, mag: 36, spr: 18, spd: 14, exp: 48, gold: 18,
    back: true, immune: ['burn'],
    actions: [{ name: '炎の嵐', effect: '魔法ダメージ小＋やけど', target: 'enemyAll' }],
  },
  {
    name: '溶岩ゴーレム', icon: '🌋', floor: 3, kind: 'elite',
    hp: 364, atk: 41, def: 45, mag: 7, spr: 10, spd: 7, exp: 168, gold: 110,
    immune: ['burn', 'poison'], counter: {},
    actions: [{ name: '溶岩の拳', effect: '物理ダメージ大', target: 'enemy' }],
  },
  {
    name: 'サラマンダー', icon: '🐉', floor: 3, kind: 'elite',
    hp: 286, atk: 34, def: 20, mag: 36, spr: 18, spd: 16, exp: 168, gold: 110,
    immune: ['burn'],
    pattern: ['灼熱の息', '爪'],
    actions: [
      { name: '灼熱の息', effect: '魔法ダメージ小＋やけど', target: 'enemyAll' },
      { name: '爪', effect: '物理ダメージ中', target: 'enemy' },
    ],
  },
  {
    name: '炎竜', icon: '🐲', floor: 3, kind: 'boss',
    hp: 910, atk: 41, def: 24, mag: 43, spr: 22, spd: 14, exp: 420, gold: 250,
    immune: ['burn'], statusResist: 0.6,
    pattern: ['爪', '爪', '炎のブレス'],
    halfHp: { text: '炎竜の体が赤熱した！（ブレスの溜めが早くなった）', pattern: ['爪', '炎のブレス'] },
    actions: [
      { name: '爪', effect: '物理ダメージ中', target: 'enemy' },
      { name: '炎のブレス', effect: '溜め：次のターンに魔法ダメージ特大', target: 'enemyAll' },
    ],
  },

  // ───────────── 4層：魔王の城（強化を打ち消す。状態異常が効きにくい敵が増える） ─────────────
  {
    name: '魔族の兵士', icon: '👹', floor: 4, kind: 'normal',
    hp: 118, atk: 47, def: 24, mag: 18, spr: 18, spd: 16, exp: 78, gold: 22,
    actions: [{ name: '剣', effect: '物理ダメージ中', target: 'enemy' }],
  },
  {
    name: '呪いの鎧', icon: '🛡️', floor: 4, kind: 'normal',
    hp: 145, atk: 50, def: 40, mag: 10, spr: 14, spd: 9, exp: 84, gold: 24,
    immune: ['poison', 'confuse'],
    actions: [{ name: '大剣', effect: '物理ダメージ中', target: 'enemy' }],
  },
  {
    name: '夢魔', icon: '😈', floor: 4, kind: 'normal',
    hp: 92, atk: 20, def: 18, mag: 44, spr: 28, spd: 20, exp: 81, gold: 24,
    back: true, immune: ['confuse'],
    actions: [
      { name: '惑わしの歌', effect: '混乱', target: 'enemy', weight: 2 },
      { name: '夢喰い', effect: '魔法ダメージ中＋吸収', target: 'enemy', weight: 1 },
    ],
  },
  {
    name: '魔獣', icon: '🐗', floor: 4, kind: 'normal',
    hp: 132, atk: 47, def: 22, mag: 10, spr: 14, spd: 18, exp: 83, gold: 22,
    actions: [{ name: '引き裂く', effect: '物理ダメージ小×2回', target: 'enemy' }],
  },
  {
    name: '闇の司祭', icon: '🕯️', floor: 4, kind: 'normal',
    hp: 106, atk: 18, def: 18, mag: 40, spr: 30, spd: 15, exp: 86, gold: 26,
    back: true,
    actions: [
      { name: '闇の癒し', effect: 'HP回復中', target: 'ally', weight: 2 },
      { name: '闇の加護', effect: '攻撃力アップ', target: 'allyAll', weight: 1 },
      { name: '闇の矢', effect: '魔法ダメージ小', target: 'enemy', weight: 1 },
    ],
  },
  {
    name: 'ガーゴイル', icon: '🦅', floor: 4, kind: 'normal',
    hp: 125, atk: 44, def: 38, mag: 10, spr: 16, spd: 14, exp: 83, gold: 24,
    immune: ['poison'], counter: {},
    actions: [{ name: '爪', effect: '物理ダメージ中', target: 'enemy' }],
  },
  {
    name: '魔王の近衛騎士', icon: '⚜️', floor: 4, kind: 'elite',
    hp: 437, atk: 44, def: 40, mag: 11, spr: 24, spd: 14, exp: 260, gold: 180,
    statusResist: 0.5,
    pattern: ['かばう', '挑発', '剣'],
    actions: [
      { name: 'かばう', effect: 'かばう（数ターン）', target: 'ally' },
      { name: '挑発', effect: '挑発', target: 'self' },
      { name: '剣', effect: '物理ダメージ中', target: 'enemy' },
    ],
  },
  {
    name: '大魔導師', icon: '🧙‍♀️', floor: 4, kind: 'elite',
    hp: 368, atk: 15, def: 22, mag: 48, spr: 36, spd: 18, exp: 260, gold: 180,
    back: true, statusResist: 0.5,
    pattern: ['解呪', '闇の嵐', '闇の矢', '闇の嵐'],
    actions: [
      { name: '解呪', effect: '強化を打ち消す', target: 'enemyAll' },
      { name: '闇の嵐', effect: '魔法ダメージ中', target: 'enemyAll' },
      { name: '闇の矢', effect: '魔法ダメージ大', target: 'enemy' },
    ],
  },
  {
    name: '魔王', icon: '👿', floor: 4, kind: 'boss',
    hp: 1150, atk: 48, def: 34, mag: 53, spr: 34, spd: 18, exp: 0, gold: 0,
    statusResist: 0.8,
    pattern: ['闇の嵐', '解呪', '魔弾', '闇の嵐'],
    halfHp: {
      text: '魔王が真の姿をあらわした！（連続で行動し、状態異常が効かなくなった）',
      pattern: ['滅びの波動', '魔弾', '解呪', '闇の嵐'],
      doubleAction: true,
      immuneAll: true,
    },
    actions: [
      { name: '闇の嵐', effect: '魔法ダメージ中', target: 'enemyAll' },
      { name: '解呪', effect: '強化を打ち消す', target: 'enemyAll' },
      { name: '魔弾', effect: '魔法ダメージ大', target: 'enemy' },
      { name: '滅びの波動', effect: '魔法ダメージ大', target: 'enemyAll' },
    ],
  },
];

export const ENEMY_BY_NAME = new Map(ENEMIES.map((e) => [e.name, e]));

/** 出現パターン（敵の名前の並び） */
export interface FloorEncounters {
  early: string[][];
  late: string[][];
  elite: string[][];
  boss: string[][];
}

export const ENCOUNTERS: Record<number, FloorEncounters> = {
  1: {
    early: [
      ['スライム', 'スライム', 'スライム'],
      ['スライム', 'スライム', '野ウサギ'],
      ['野ウサギ', '野ウサギ'],
      ['大ガラス', 'スライム'],
      ['毒キノコ', 'スライム'],
    ],
    late: [
      ['草原オオカミ', '草原オオカミ', '草原オオカミ'],
      ['草原オオカミ', '草原オオカミ', '大ガラス'],
      ['野盗', '野ウサギ'],
      ['毒キノコ', '毒キノコ', '大ガラス'],
      ['スライム', 'スライム', 'スライム', 'スライム'],
      ['野盗', '大ガラス'],
    ],
    elite: [['森の大熊'], ['野盗の用心棒', '野盗']],
    boss: [['草原の主（大角獣）']],
  },
  2: {
    early: [
      ['雪ウサギ', '雪ウサギ'],
      ['雪狼', '雪狼'],
      ['氷の精', '雪原の小鬼'],
      ['氷柱コウモリ', '雪ウサギ'],
      ['凍った亡者'],
    ],
    late: [
      ['雪狼', '雪狼', '雪狼'],
      ['凍った亡者', '氷の精'],
      ['雪原の小鬼', '雪原の小鬼', '氷柱コウモリ'],
      ['雪ウサギ', '雪ウサギ', '氷の精'],
      ['凍った亡者', '雪狼', '氷柱コウモリ'],
    ],
    elite: [['雪男'], ['氷の魔術師', '雪原の小鬼']],
    boss: [['氷の女王']],
  },
  3: {
    early: [
      ['火トカゲ', '火トカゲ'],
      ['溶岩スライム', '火山コウモリ'],
      ['岩ゴーレム'],
      ['火の鳥', '火トカゲ'],
      ['炎の魔導師', '溶岩スライム'],
    ],
    late: [
      ['火トカゲ', '火トカゲ', '火の鳥'],
      ['岩ゴーレム', '炎の魔導師'],
      ['溶岩スライム', '溶岩スライム', '火山コウモリ'],
      ['火山コウモリ', '火山コウモリ', '火の鳥'],
      ['岩ゴーレム', '火トカゲ', '炎の魔導師'],
    ],
    elite: [['溶岩ゴーレム'], ['サラマンダー']],
    boss: [['炎竜']],
  },
  4: {
    early: [
      ['魔族の兵士', '魔族の兵士'],
      ['呪いの鎧', '夢魔'],
      ['魔獣', '闇の司祭'],
      ['ガーゴイル', '魔族の兵士'],
    ],
    late: [
      ['魔族の兵士', '魔獣', '闇の司祭'],
      ['呪いの鎧', '呪いの鎧', '夢魔'],
      ['ガーゴイル', '魔獣', '夢魔'],
      ['魔族の兵士', '魔族の兵士', '闇の司祭'],
    ],
    elite: [['魔王の近衛騎士', '魔族の兵士', '魔族の兵士'], ['大魔導師', '呪いの鎧']],
    boss: [['魔王']],
  },
};
