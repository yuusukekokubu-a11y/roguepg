// 職業イベント：その職業の仲間がパーティーにいると起きる（actors[0] がその仲間）。

import {
  boost,
  boostSize,
  expAll,
  floorExp,
  gainGold,
  giveAccessory,
  giveBook,
  giveItem,
  healAll,
  healOne,
  hurtAll,
  hurtOne,
  join,
  mpAll,
  who,
  type GameEvent,
} from '../../engine/eventKit';

const job = (name: string, e: Omit<GameEvent, 'kind' | 'jobs' | 'id'> & { id: string }): GameEvent => ({ ...e, kind: 'job', jobs: [name] });

export const JOB_EVENTS: GameEvent[] = [
  job('戦士', {
    id: 'job-warrior',
    title: '腕相撲大会',
    icon: '💪',
    text: ({ actors: [a] }) => `旅の商隊が腕相撲大会を開いている。${who(a)}の腕がうずいている。`,
    choices: [
      {
        label: '出場する',
        resolve: ({ run, rng, actors: [a] }) =>
          rng.chance(0.65)
            ? { text: join(`${who(a)}は優勝した！`, gainGold(run, 30 * run.floor), boost(a, { atk: 1 })) }
            : { text: join(`${who(a)}は決勝で敗れた。くやしさが力になる。`, boost(a, { atk: 1 })) },
      },
      { label: '見物する', resolve: ({ run }) => ({ text: join('盛り上がる大会を見て元気が出た。', healAll(run, 0.15)) }) },
    ],
  }),
  job('騎士', {
    id: 'job-knight',
    title: '困っている旅人',
    icon: '🧳',
    text: ({ actors: [a] }) => `荷車が溝にはまって動けない旅人がいる。${who(a)}は迷わず駆け寄った。`,
    choices: [
      {
        label: '荷車を押し上げる（騎士のHP10%減）',
        resolve: ({ run, rng, actors: [a] }) => ({ text: join(hurtOne(a, 0.1), '旅人は何度も頭を下げた。', boost(a, { def: boostSize(run) }), giveItem(run, rng)) }),
      },
      { label: '道を教えるだけにする', resolve: () => ({ text: '旅人は礼を言って別の道へ向かった。' }) },
    ],
  }),
  job('暗黒騎士', {
    id: 'job-darkknight',
    title: '闇のささやき',
    icon: '🌑',
    text: ({ actors: [a] }) => `${who(a)}の剣が黒く脈打っている。「もっと力が欲しくはないか……」`,
    choices: [
      {
        label: '力を受け入れる（攻撃力が大きく上がり、最大HPが減る）',
        resolve: ({ run, actors: [a] }) => ({ text: join(`${who(a)}の瞳が赤く光った。`, boost(a, { atk: boostSize(run) + 2, hp: -5 })) }),
      },
      {
        label: '声をはねのける',
        resolve: ({ actors: [a] }) => ({ text: join(`${who(a)}は剣を鞘に収めた。心が静まる。`, boost(a, { spr: 2 })) }),
      },
    ],
  }),
  job('侍', {
    id: 'job-samurai',
    title: '山中の滝',
    icon: '🏞️',
    text: ({ actors: [a] }) => `轟音を立てて流れ落ちる滝がある。${who(a)}は刀を置き、静かに目を閉じた。`,
    choices: [
      { label: '滝に打たれる（素早さ+）', resolve: ({ run, actors: [a] }) => ({ text: join(hurtOne(a, 0.1), boost(a, { spd: Math.ceil(boostSize(run) / 2) })) }) },
      { label: '居合の型を繰り返す（攻撃力+）', resolve: ({ run, actors: [a] }) => ({ text: boost(a, { atk: boostSize(run) }) }) },
    ],
  }),
  job('白魔道士', {
    id: 'job-whitemage',
    title: '傷ついた子鹿',
    icon: '🦌',
    text: ({ actors: [a] }) => `罠にかかった子鹿が震えている。${who(a)}がそっと手を伸ばした。`,
    choices: [
      {
        label: '癒しの魔法をかける（白魔道士のMP30%減）',
        resolve: ({ run, actors: [a] }) => {
          a.mp = Math.max(0, a.mp - Math.round(a.mp * 0.3));
          return { text: join('子鹿は元気に駆けていった。森の空気が澄みわたる。', boost(a, { spr: boostSize(run) }), healAll(run, 0.2)) };
        },
      },
      { label: '罠だけ外す', resolve: ({ run, rng }) => ({ text: join('罠の持ち主が残した袋を見つけた。', giveItem(run, rng)) }) },
    ],
  }),
  job('黒魔道士', {
    id: 'job-blackmage',
    title: '魔力のよどみ',
    icon: '🌀',
    text: ({ actors: [a] }) => `空間がゆがみ、濃い魔力がよどんでいる。${who(a)}の杖が震えている。`,
    choices: [
      {
        label: '魔力を取り込む（魔力+。失敗するとダメージ）',
        resolve: ({ run, rng, actors: [a] }) =>
          rng.chance(0.7)
            ? { text: join('魔力が体になじんだ！', boost(a, { mag: boostSize(run) + 1 })) }
            : { text: join('魔力が暴走した！', hurtAll(run, 0.15), boost(a, { mag: 1 })) },
      },
      { label: '魔力を散らす（全員のMP回復）', resolve: ({ run }) => ({ text: join('よどみを散らすと、心地よい魔力が満ちた。', mpAll(run, 0.4)) }) },
    ],
  }),
  job('赤魔道士', {
    id: 'job-redmage',
    title: '師匠の手紙',
    icon: '✉️',
    text: ({ actors: [a] }) => `${who(a)}あてに、旅の師匠から手紙と小包が届いていた。`,
    choices: [
      { label: '小包を開ける', resolve: ({ run, rng, actors: [a] }) => ({ text: join('中には古い魔導書が入っていた。', giveBook(run, rng, { job: a.job })) }) },
      { label: '手紙の教えを読み返す（魔力・攻撃力+1）', resolve: ({ actors: [a] }) => ({ text: boost(a, { mag: 1, atk: 1 }) }) },
    ],
  }),
  job('呪術師', {
    id: 'job-curser',
    title: '呪われた人形',
    icon: '🪆',
    text: ({ actors: [a] }) => `道ばたに不気味な人形が落ちている。${who(a)}は「これはいい呪いだ」とつぶやいた。`,
    choices: [
      {
        label: '呪いを読み解く（精神・魔力+）',
        resolve: ({ run, actors: [a] }) => ({ text: join(hurtOne(a, 0.1), boost(a, { spr: boostSize(run), mag: 1 })) }),
      },
      { label: '人形を持っていく', resolve: ({ run, rng }) => ({ text: giveAccessory(run, rng, { name: rng.chance(0.5) ? '呪われた首輪' : '身代わり人形' }) }) },
    ],
  }),
  job('盗賊', {
    id: 'job-thief',
    title: '鍵のかかった宝箱',
    icon: '🔐',
    text: ({ actors: [a] }) => `頑丈な宝箱がある。${who(a)}は「任せとけ」と針金を取り出した。`,
    choices: [
      {
        label: '鍵を開ける',
        resolve: ({ run, rng, actors: [a] }) =>
          rng.chance(0.8)
            ? { text: join('カチリ。', gainGold(run, 25 * run.floor), giveItem(run, rng, { rare: rng.chance(0.3) })) }
            : { text: join('罠だ！ 毒針が飛び出した。', hurtOne(a, 0.2)) },
      },
      { label: '箱ごと担いでいく（素早さ-1、お金）', resolve: ({ run, actors: [a] }) => ({ text: join('重い……', boost(a, { spd: -1 }), gainGold(run, 40 * run.floor)) }) },
    ],
  }),
  job('狩人', {
    id: 'job-hunter',
    title: '大物の足跡',
    icon: '🐾',
    text: ({ actors: [a] }) => `${who(a)}が地面の大きな足跡に気づいた。「この先に大物がいる」`,
    choices: [
      {
        label: '狩りに行く（強敵と戦闘）',
        resolve: ({ run }) => {
          const elite = { 1: ['森の大熊'], 2: ['雪男'], 3: ['サラマンダー'], 4: ['魔獣', '魔獣'] }[run.floor] ?? ['森の大熊'];
          return { text: '足跡の主があらわれた！', battle: elite };
        },
      },
      { label: '待ち伏せの練習をする（攻撃力・素早さ+1）', resolve: ({ actors: [a] }) => ({ text: boost(a, { atk: 1, spd: 1 }) }) },
    ],
  }),
  job('錬金術師', {
    id: 'job-alchemist',
    title: '珍しい薬草',
    icon: '🌿',
    text: ({ actors: [a] }) => `${who(a)}が岩陰の薬草を見つけて目を輝かせた。「これは珍しい！」`,
    choices: [
      { label: '薬を調合する', resolve: ({ run, rng }) => ({ text: join(giveItem(run, rng, { name: '万能薬' }), giveItem(run, rng, { name: '回復薬' })) }) },
      { label: '自分で試してみる', resolve: ({ run, actors: [a] }) => ({ text: join('なかなか効く。', boost(a, { hp: 3 + run.floor * 2 })) }) },
    ],
  }),
  job('吟遊詩人', {
    id: 'job-bard',
    title: '村の祭り',
    icon: '🎪',
    text: ({ actors: [a] }) => `小さな村で祭りが開かれている。${who(a)}は竪琴を手に取った。`,
    choices: [
      { label: '演奏する（お金）', resolve: ({ run, actors: [a] }) => ({ text: join(`${who(a)}の歌に村人が聞きほれた。`, gainGold(run, 35 * run.floor)) }) },
      { label: '英雄の歌を学ぶ（全員の経験値）', resolve: ({ run }) => ({ text: join('古い英雄譚を教わった。', expAll(run, floorExp(run, 8))) }) },
    ],
  }),
  job('踊り子', {
    id: 'job-dancer',
    title: '酒場の舞台',
    icon: '🍺',
    text: ({ actors: [a] }) => `にぎやかな酒場。店主が${who(a)}を見て「一曲踊ってくれないか」と頼んできた。`,
    choices: [
      { label: '踊る（お金と、全員のHP回復）', resolve: ({ run }) => ({ text: join('酒場は大喝采！ ごちそうもふるまわれた。', gainGold(run, 25 * run.floor), healAll(run, 0.2)) }) },
      { label: '新しいステップを練習する（素早さ+）', resolve: ({ run, actors: [a] }) => ({ text: boost(a, { spd: Math.ceil(boostSize(run) / 2) + 1 }) }) },
    ],
  }),
  job('召喚士', {
    id: 'job-summoner',
    title: '精霊のほこら',
    icon: '⛩️',
    text: ({ actors: [a] }) => `小さなほこらから、精霊の声がする。「契約者よ、何を望む？」${who(a)}が一歩前に出た。`,
    choices: [
      { label: '魔力の器を広げる（最大MP+）', resolve: ({ run, actors: [a] }) => ({ text: boost(a, { mp: 4 + run.floor * 2 }) }) },
      { label: '仲間の傷を癒してもらう', resolve: ({ run, actors: [a] }) => ({ text: join(healAll(run, 0.3), healOne(a, 0.2)) }) },
    ],
  }),
];
