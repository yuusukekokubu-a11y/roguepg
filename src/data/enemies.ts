// 敵のデータ。名前・特徴は企画書の「敵」シートに合わせている。
// 敵の技もスキルブックと同じ「部品」の文章で書く（parser で読み取る）。
// いまは1層（草原）のみ数値を入れている。

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
}

export const ENEMIES: EnemyDef[] = [
  {
    name: 'スライム',
    icon: '🟢',
    floor: 1,
    kind: 'normal',
    hp: 9,
    atk: 5,
    def: 2,
    mag: 2,
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
    hp: 10,
    atk: 6,
    def: 3,
    mag: 2,
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
    hp: 12,
    atk: 6,
    def: 3,
    mag: 2,
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
    hp: 13,
    atk: 5,
    def: 4,
    mag: 6,
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
    hp: 12,
    atk: 7,
    def: 3,
    mag: 2,
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
    hp: 16,
    atk: 7,
    def: 4,
    mag: 3,
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
    hp: 60,
    atk: 10,
    def: 6,
    mag: 3,
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
    hp: 52,
    atk: 8,
    def: 9,
    mag: 3,
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
    hp: 150,
    atk: 10,
    def: 7,
    mag: 4,
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
};
