// ゲーム全体で使う「型」（データの形）の定義。
// 企画書の「部品」シートに対応する。

export type Stat = 'hp' | 'mp' | 'atk' | 'def' | 'mag' | 'spr' | 'spd';
export const STATS: Stat[] = ['hp', 'mp', 'atk', 'def', 'mag', 'spr', 'spd'];
export const STAT_LABEL: Record<Stat, string> = {
  hp: 'HP',
  mp: 'MP',
  atk: '攻撃',
  def: '防御',
  mag: '魔力',
  spr: '精神',
  spd: '素早さ',
};

export type StatusId = 'poison' | 'burn' | 'confuse' | 'stun';
export const STATUS_LABEL: Record<StatusId, string> = {
  poison: '毒',
  burn: 'やけど',
  confuse: '混乱',
  stun: 'スタン',
};

/** 小・中・大・特大 */
export type Size = 'small' | 'medium' | 'large' | 'huge';

/** 技の対象 */
export type TargetKind =
  | 'enemy' // 単体
  | 'enemyAll' // 全体
  | 'enemyFront' // 前列
  | 'random' // ランダム
  | 'self' // 自分
  | 'ally' // 味方単体
  | 'allyAll' // 味方全体
  | 'none'; // 対象なし（煙玉など）

export type Cost =
  | { kind: 'none' }
  | { kind: 'mp'; size: 'small' | 'medium' | 'large' | 'all' }
  | { kind: 'hp'; size: 'small' | 'medium' | 'large' };

/** 威力が変わる条件 */
export type Condition =
  | 'targetStatused' // 状態異常の敵に威力アップ
  | 'targetPoisoned' // 毒の敵に威力アップ
  | 'targetPoisonedHuge' // 毒の敵なら威力特大
  | 'selfHpLow' // 自分のHPが低いほど
  | 'defHigh' // 防御力が高いほど
  | 'spdHigh' // 素早さが高いほど
  | 'targetHpLow' // HPが少ない敵に
  | 'targetHpHigh' // HPが多い敵に
  | 'targetStatusCount' // 敵の状態異常の数だけ
  | 'selfBuffCount' // 自分にかかった強化の数だけ
  | 'lingeringCount' // 場に残っている効果の数だけ
  | 'lastAttacker' // 直前に攻撃してきた敵に
  | 'lifestealSelfHpLow'; // 自分のHPが低いほど吸収量アップ

/** 効果の部品 */
export type Effect =
  | {
      kind: 'damage';
      type: 'physical' | 'magic' | 'hybrid' | 'fixed';
      size: Size;
      hits: [number, number];
      lifesteal?: boolean;
      crit?: boolean;
      /** 威力を直接指定（通常攻撃＝1.0） */
      power?: number;
    }
  | { kind: 'heal'; size: Size | 'full' }
  | { kind: 'mpHeal'; size: Size | 'full' }
  | { kind: 'revive'; hp: 'tiny' | 'normal' | 'full' }
  | { kind: 'status'; status: StatusId; stacks: number }
  | { kind: 'cure'; statuses: StatusId[] }
  | { kind: 'ward'; turns: number } // 状態異常を防ぐ
  | { kind: 'buff'; stats: Stat[]; amount: number; turns: number } // amount: +0.25 = 25%アップ
  | { kind: 'dispel' } // 強化を打ち消す
  | { kind: 'charge'; mul: number; crit?: boolean; scope: 'attack' | 'magic' | 'any' } // 溜め：次の攻撃を強化
  | { kind: 'delayed'; effects: Effect[] } // 溜め：次のターンに発動
  | { kind: 'multiCast'; count: number } // 連続行動
  | { kind: 'echo'; count: number } // 残響：次の魔法が count 回追加で発動する（MPは1回分）
  | { kind: 'haste'; amount: number } // 行動順（+で早める、-で遅らせる）
  | { kind: 'cover'; turns: number } // かばう
  | { kind: 'taunt'; turns: number } // 挑発
  | { kind: 'counter'; turns: number; status?: StatusId } // 反撃
  | { kind: 'evade'; amount: number; turns: number } // 回避アップ
  | { kind: 'dodgeCounter' } // 回避＋反撃（1回）
  | { kind: 'guard'; mul: number; turns: number } // 受けるダメージ軽減
  | { kind: 'tick'; effects: Effect[]; turns: number } // 毎ターン◯◯（数ターン）
  | { kind: 'imbue'; what: 'lifesteal' | 'poison' | 'magic'; turns: number } // 攻撃に◯◯がつく
  | { kind: 'steal'; rare: boolean }
  | { kind: 'gold' }
  | { kind: 'bonusReward' }
  | { kind: 'escape' }
  | { kind: 'restAll' }
  | { kind: 'levelUp' };

export interface ParsedAction {
  effects: Effect[];
  conditions: Condition[];
}
