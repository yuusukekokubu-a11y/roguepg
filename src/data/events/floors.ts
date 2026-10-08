// その層だけで起きるイベント。

import {
  alive,
  boost,
  expAll,
  floorExp,
  giveAccessory,
  giveBook,
  giveGear,
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
  type GameEvent,
} from '../../engine/eventKit';

export const FLOOR_EVENTS: GameEvent[] = [
  // ───── 1層：草原 ─────
  {
    id: 'shepherd',
    kind: 'floor',
    floors: [1],
    title: '迷子の羊',
    icon: '🐑',
    text: '羊飼いの少年が泣いている。「羊が一匹、オオカミの縄張りに逃げちゃったんだ……」',
    choices: [
      {
        label: '探しに行く（戦闘になる）',
        resolve: () => ({ text: '羊は見つかったが、オオカミの群れも一緒だった！', battle: ['草原オオカミ', '草原オオカミ'] }),
      },
      {
        label: '少年をなぐさめる',
        resolve: ({ run, rng }) => ({ text: join('少年は笑顔になり、お礼に母さんの薬をくれた。', giveItem(run, rng, { name: '回復薬' })) }),
      },
    ],
  },
  {
    id: 'berries',
    kind: 'floor',
    floors: [1],
    title: '野いちごの茂み',
    icon: '🍓',
    text: '赤い実がたわわに実っている。少しだけ、見たことのない色の実もまじっている。',
    choices: [
      { label: 'いつもの実を食べる（全員のHPを20%回復）', resolve: ({ run }) => ({ text: join('甘酸っぱい！', healAll(run, 0.2)) }) },
      {
        label: '見慣れない実を食べる（主人公）',
        resolve: ({ run, rng }) =>
          rng.chance(0.6)
            ? { text: join('体の奥から力がわいてくる！', boost(run.party[0], { hp: 5 })) }
            : { text: join('おなかをこわした……', hurtOne(run.party[0], 0.2)) },
      },
    ],
  },
  // ───── 2層：氷雪地帯 ─────
  {
    id: 'snow-hut',
    kind: 'floor',
    floors: [2],
    title: '雪に埋もれた小屋',
    icon: '🛖',
    text: '吹雪の中に、煙突のある小屋が見えた。中には暖炉と、古い荷物がある。',
    choices: [
      { label: '暖炉で暖まる（HP・MPを25%回復、仲間も復活）', resolve: ({ run }) => ({ text: join(healAll(run, 0.25), mpAll(run, 0.25), reviveAll(run, 0.25)) }) },
      { label: '荷物を調べる', resolve: ({ run, rng }) => ({ text: join('古い荷物の中に……', giveItem(run, rng), giveItem(run, rng)) }) },
    ],
  },
  {
    id: 'ice-cave',
    kind: 'floor',
    floors: [2],
    title: '凍った洞窟',
    icon: '🧊',
    text: '氷の壁の奥で、何かが光っている。削り出すには体を張る必要がありそうだ。',
    choices: [
      {
        label: '氷を割って取り出す（全員HP15%減）',
        resolve: ({ run, rng }) => ({ text: join(hurtAll(run, 0.15), '氷の中から出てきたのは……', giveAccessory(run, rng, { rareChance: 0.3 })) }),
      },
      { label: 'あきらめる', resolve: () => ({ text: '冷たい風が吹き抜けていった。' }) },
    ],
  },
  // ───── 3層：火山 ─────
  {
    id: 'hot-spring',
    kind: 'floor',
    floors: [3],
    title: '溶岩の温泉',
    icon: '♨️',
    text: '溶岩に温められた湯がわいている。ちょっと熱すぎるかもしれない。',
    choices: [
      {
        label: 'つかる（HP・MPを40%回復。たまにのぼせる）',
        resolve: ({ run, rng }) => {
          const base = join(healAll(run, 0.4), mpAll(run, 0.4));
          return rng.chance(0.25) ? { text: join(base, 'のぼせて少しふらふらする……', hurtAll(run, 0.1)) } : { text: base };
        },
      },
      { label: '先を急ぐ', resolve: () => ({ text: '湯気の向こうへ進んだ。' }) },
    ],
  },
  {
    id: 'forge',
    kind: 'floor',
    floors: [3],
    title: 'ドワーフの鍛冶場跡',
    icon: '⚒️',
    text: '火山の熱を使った古い鍛冶場だ。炉にはまだ火が残っている。',
    choices: [
      {
        label: ({ run }) => `${40 + run.floor * 20}G払って装備を打ってもらう（主人公用）`,
        disabled: ({ run }) => needGold(run, 40 + run.floor * 20),
        resolve: ({ run, rng }) => ({ text: join(payGold(run, 40 + run.floor * 20), '槌の音が響いた。', giveGear(run, rng, run.party[0], 1)) }),
      },
      {
        label: '炉の火で武器を鍛え直す（全員の攻撃力+1）',
        resolve: ({ run }) => ({ text: alive(run).map((c) => boost(c, { atk: 1 })).join(' ') }),
      },
    ],
  },
  // ───── 4層：魔王の城 ─────
  {
    id: 'prisoner',
    kind: 'floor',
    floors: [4],
    title: '囚われの騎士',
    icon: '⛓️',
    text: '牢の中で、傷だらけの騎士がこちらを見ている。「頼む……鍵を……」',
    choices: [
      {
        label: '牢を壊して助ける（見張りと戦闘）',
        resolve: () => ({ text: '牢を壊す音に、見張りが駆けつけた！', battle: ['魔族の兵士', '魔族の兵士'] }),
      },
      {
        label: '話を聞く',
        resolve: ({ run, rng }) => ({
          text: join('騎士は城の弱点を教えてくれた。「魔王は強化を打ち消してくる。頼りすぎるな」', expAll(run, floorExp(run, 6)), giveItem(run, rng, { rare: rng.chance(0.3) })),
        }),
      },
    ],
  },
  {
    id: 'library',
    kind: 'floor',
    floors: [4],
    title: '魔王の書庫',
    icon: '📚',
    text: '禁じられた書物がずらりと並ぶ。本を開くたびに、黒い霧が立ちのぼる。',
    choices: [
      {
        label: 'レア本を探す（主人公のHP30%減）',
        disabled: ({ run }) => needHp(run.party[0], 0.3),
        resolve: ({ run, rng }) => {
          const jobs = run.party.map((c) => c.job);
          return { text: join(hurtOne(run.party[0], 0.3), giveBook(run, rng, { job: rng.pick(jobs), rare: true })) };
        },
      },
      {
        label: '魔導の知識を学ぶ（全員の魔力+2）',
        resolve: ({ run }) => ({ text: alive(run).map((c) => boost(c, { mag: 2 })).join(' ') }),
      },
    ],
  },
];
