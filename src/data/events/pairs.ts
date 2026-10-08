// ペアイベント：特定の2職業がパーティーにそろうと起きる。
// actors[0] が jobs[0]、actors[1] が jobs[1] の仲間。

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
  hurtAll,
  hurtOne,
  join,
  mpAll,
  needGold,
  needHp,
  payGold,
  reviveAll,
  who,
  type GameEvent,
} from '../../engine/eventKit';

const pair = (a: string, b: string, e: Omit<GameEvent, 'kind' | 'jobs'>): GameEvent => ({ ...e, kind: 'pair', jobs: [a, b] });

export const PAIR_EVENTS: GameEvent[] = [
  pair('戦士', '騎士', {
    id: 'pair-warrior-knight',
    title: '剣と盾の手合わせ',
    icon: '🤺',
    text: ({ actors: [a, b] }) => `休憩中、${who(a)}が${who(b)}に「一本どうだ」と木剣を投げた。`,
    choices: [
      {
        label: '本気で手合わせする',
        resolve: ({ run, actors: [a, b] }) => ({ text: join('火花が散るような打ち合いだった。', hurtOne(a, 0.1), hurtOne(b, 0.1), boost(a, { atk: boostSize(run) }), boost(b, { def: boostSize(run) })) }),
      },
      { label: '型の確認だけにする', resolve: ({ actors: [a, b] }) => ({ text: join(boost(a, { def: 1 }), boost(b, { atk: 1 })) }) },
    ],
  }),
  pair('白魔道士', '黒魔道士', {
    id: 'pair-white-black',
    title: '白と黒の魔法談義',
    icon: '☯️',
    text: ({ actors: [a, b] }) => `焚き火を囲んで、${who(a)}と${who(b)}の魔法談義が止まらない。「癒しこそ魔法の本質」「いや、破壊こそ」`,
    choices: [
      { label: 'とことん語り合わせる（お互いの得意を学ぶ）', resolve: ({ run, actors: [a, b] }) => ({ text: join(boost(a, { mag: boostSize(run) }), boost(b, { spr: boostSize(run) })) }) },
      { label: '「もう寝よう」と止める（全員のMP回復）', resolve: ({ run }) => ({ text: join('ぐっすり眠った。', mpAll(run, 0.5)) }) },
    ],
  }),
  pair('盗賊', '狩人', {
    id: 'pair-thief-hunter',
    title: '獲物の山分け',
    icon: '💰',
    text: ({ actors: [a, b] }) => `${who(b)}が仕留めた獲物を、${who(a)}が「市場で高く売れるぜ」と値踏みしている。`,
    choices: [
      { label: '売りに行く', resolve: ({ run }) => ({ text: join('いい値がついた！', gainGold(run, 45 * run.floor)) }) },
      { label: '燻製にして保存食にする', resolve: ({ run, rng }) => ({ text: join(healAll(run, 0.25), giveItem(run, rng, { name: '休息のテント' })) }) },
    ],
  }),
  pair('侍', '暗黒騎士', {
    id: 'pair-samurai-darkknight',
    title: '二つの剣の道',
    icon: '⚔️',
    text: ({ actors: [a, b] }) => `${who(a)}と${who(b)}が向かい合う。「お前の剣は己を削る剣だな」「お前の剣は、迷いがない」`,
    choices: [
      {
        label: '真剣で立ち合う（2人ともHP20%減、攻撃力+）',
        disabled: ({ actors: [a, b] }) => needHp(a, 0.2) ?? needHp(b, 0.2),
        resolve: ({ run, actors: [a, b] }) => ({ text: join(hurtOne(a, 0.2), hurtOne(b, 0.2), boost(a, { atk: boostSize(run) }), boost(b, { atk: boostSize(run) })) }),
      },
      { label: '言葉を交わすだけにする', resolve: ({ actors: [a, b] }) => ({ text: join(boost(a, { spr: 1 }), boost(b, { spr: 1 })) }) },
    ],
  }),
  pair('吟遊詩人', '踊り子', {
    id: 'pair-bard-dancer',
    title: '即興の舞台',
    icon: '🎭',
    text: ({ actors: [a, b] }) => `広場に人が集まってきた。${who(a)}が竪琴を鳴らすと、${who(b)}が自然に踊り出した。`,
    choices: [
      { label: '投げ銭をもらう', resolve: ({ run }) => ({ text: join('割れんばかりの拍手！', gainGold(run, 50 * run.floor)) }) },
      { label: 'パーティーのための舞にする', resolve: ({ run, actors: [a, b] }) => ({ text: join('力がわいてくる！', healAll(run, 0.3), boost(a, { spd: 1 }), boost(b, { spd: 1 })) }) },
    ],
  }),
  pair('錬金術師', '白魔道士', {
    id: 'pair-alchemist-whitemage',
    title: '薬と祈りの研究',
    icon: '🧪',
    text: ({ actors: [a, b] }) => `${who(a)}の薬に、${who(b)}が祈りを込めてみることになった。`,
    choices: [
      { label: '回復薬を作る', resolve: ({ run, rng }) => ({ text: join(giveItem(run, rng, { name: '上級回復薬' }), giveItem(run, rng, { name: '気付け薬' })) }) },
      { label: '幻の霊薬に挑む（成功すれば命の雫）', resolve: ({ run, rng }) => (rng.chance(0.5) ? { text: join('奇跡の一滴ができた！', giveItem(run, rng, { name: '命の雫' })) } : { text: join('煙がもくもくと……', hurtAll(run, 0.05)) }) },
    ],
  }),
  pair('召喚士', '呪術師', {
    id: 'pair-summoner-curser',
    title: '禁じられた儀式',
    icon: '🕯️',
    text: ({ actors: [a, b] }) => `古い魔法陣を見つけた。${who(a)}と${who(b)}が顔を見合わせる。「……やってみる？」`,
    choices: [
      {
        label: '儀式を行う（全員HP20%減、レアアクセサリー）',
        resolve: ({ run, rng }) => ({ text: join(hurtAll(run, 0.2), '魔法陣から何かが浮かび上がった。', giveAccessory(run, rng, { rareChance: 1 })) }),
      },
      { label: '魔法陣を書き写す（2人の魔力+）', resolve: ({ actors: [a, b] }) => ({ text: join(boost(a, { mag: 2 }), boost(b, { mag: 2 })) }) },
    ],
  }),
  pair('赤魔道士', '黒魔道士', {
    id: 'pair-redmage-blackmage',
    title: '魔法剣の講義',
    icon: '📖',
    text: ({ actors: [a, b] }) => `${who(b)}が「剣も魔法も半端だ」と言うと、${who(a)}は笑って「なら見せてやる」と杖を構えた。`,
    choices: [
      { label: '技を教え合う（2人の本を1冊ずつ）', resolve: ({ run, rng, actors: [a, b] }) => ({ text: join(giveBook(run, rng, { job: a.job }), giveBook(run, rng, { job: b.job })) }) },
      { label: '腕比べをする（全員の経験値）', resolve: ({ run }) => ({ text: expAll(run, floorExp(run, 10)) }) },
    ],
  }),
  pair('騎士', '吟遊詩人', {
    id: 'pair-knight-bard',
    title: '英雄譚の取材',
    icon: '📜',
    text: ({ actors: [a, b] }) => `${who(b)}が${who(a)}に「あなたの武勇伝を歌にしたい」とせがんでいる。`,
    choices: [
      { label: '武勇伝を語る', resolve: ({ run, actors: [a] }) => ({ text: join('歌は街で評判になり、勇気がわいた。', boost(a, { def: 2 }), expAll(run, floorExp(run, 6))) }) },
      { label: '謙遜する（騎士の精神+）', resolve: ({ actors: [a, b] }) => ({ text: join(`${who(b)}は「それもまた騎士らしい」と書き留めた。`, boost(a, { spr: 2 })) }) },
    ],
  }),
  pair('狩人', '召喚士', {
    id: 'pair-hunter-summoner',
    title: '森の精霊',
    icon: '🦉',
    text: ({ actors: [a, b] }) => `${who(a)}が森の奥で光る梟を見つけた。${who(b)}が「あれは精霊だ」とささやく。`,
    choices: [
      { label: '精霊についていく', resolve: ({ run, rng }) => ({ text: join('精霊は泉に案内してくれた。', healAll(run, 0.3), reviveAll(run, 0.3), giveItem(run, rng)) }) },
      { label: '精霊と心を通わせる（2人の精神+）', resolve: ({ run, actors: [a, b] }) => ({ text: join(boost(a, { spr: boostSize(run) }), boost(b, { spr: boostSize(run) })) }) },
    ],
  }),
  pair('盗賊', '錬金術師', {
    id: 'pair-thief-alchemist',
    title: 'あやしい取引',
    icon: '🤝',
    text: ({ actors: [a, b] }) => `${who(a)}が闇市の情報を仕入れてきた。${who(b)}の薬なら高く売れるらしい。`,
    choices: [
      {
        label: ({ run }) => `${20 * run.floor}G元手に取引する`,
        disabled: ({ run }) => needGold(run, 20 * run.floor),
        resolve: ({ run, rng }) =>
          rng.chance(0.65)
            ? { text: join(payGold(run, 20 * run.floor), '大もうけ！', gainGold(run, 70 * run.floor)) }
            : { text: join(payGold(run, 20 * run.floor), '役人に見つかって、品物を没収された……') },
      },
      { label: '危ない橋は渡らない', resolve: () => ({ text: '2人は肩をすくめた。' }) },
    ],
  }),
  pair('踊り子', '侍', {
    id: 'pair-dancer-samurai',
    title: '剣の舞',
    icon: '🗡️',
    text: ({ actors: [a, b] }) => `${who(a)}の舞と${who(b)}の剣さばき。2人の動きがぴたりと重なった。`,
    choices: [
      { label: '2人で稽古を続ける（素早さ+）', resolve: ({ run, actors: [a, b] }) => ({ text: join(boost(a, { spd: Math.ceil(boostSize(run) / 2) }), boost(b, { spd: Math.ceil(boostSize(run) / 2) })) }) },
      { label: '旅の一座に見せる（お金）', resolve: ({ run }) => ({ text: join('一座の座長が感激していた。', gainGold(run, 40 * run.floor)) }) },
    ],
  }),
];
