// マップの「イベント」マス：どのイベントを起こすかを決める。
// イベントの中身は src/data/events/ にある。
//
// 出やすさ：ペア ＞ 職業 ＞ 層 ＞ いつでも。同じイベントは1回のランで二度起きない。

import { FLOOR_EVENTS } from '../data/events/floors';
import { GENERAL_EVENTS } from '../data/events/general';
import { JOB_EVENTS } from '../data/events/jobs';
import { PAIR_EVENTS } from '../data/events/pairs';
import type { Character } from './character';
import { textOf, type EventCtx, type EventOutcome, type GameEvent } from './eventKit';
import { rngOf, type RunState } from './run';

export type { EventChoice, EventOutcome, GameEvent } from './eventKit';

export const EVENTS: GameEvent[] = [...GENERAL_EVENTS, ...FLOOR_EVENTS, ...JOB_EVENTS, ...PAIR_EVENTS];

const WEIGHT: Record<GameEvent['kind'], number> = { pair: 5, job: 3, floor: 2.5, general: 1 };

export interface EventPick {
  event: GameEvent;
  /** 主役のキャラの id（職業イベントは1人、ペアは2人） */
  actorIds: string[];
}

/** このイベントの主役を選ぶ。条件を満たさないなら null */
export function eventActors(run: RunState, ev: GameEvent): Character[] | null {
  if (ev.floors && !ev.floors.includes(run.floor)) return null;
  if (!ev.jobs) return [];
  const used = new Set<string>();
  const actors: Character[] = [];
  for (const job of ev.jobs) {
    const c = run.party.find((x) => x.job === job && x.hp > 0 && !used.has(x.id));
    if (!c) return null;
    used.add(c.id);
    actors.push(c);
  }
  return actors;
}

export function pickEvent(run: RunState): EventPick {
  const rng = rngOf(run);
  const seen = new Set(run.seenEvents ?? []);
  const candidates = EVENTS.flatMap((ev) => {
    const actors = eventActors(run, ev);
    return actors && !seen.has(ev.id) ? [[{ event: ev, actorIds: actors.map((a) => a.id) }, WEIGHT[ev.kind]] as [EventPick, number]] : [];
  });
  // 全部見てしまったら、いつでも起きるイベントをもう一度
  const pick =
    candidates.length > 0 ? rng.weighted(candidates) : { event: rng.pick(EVENTS.filter((e) => e.kind === 'general')), actorIds: [] };
  run.seenEvents = [...(run.seenEvents ?? []), pick.event.id];
  return pick;
}

export function eventCtx(run: RunState, pick: EventPick): EventCtx {
  return { run, actors: pick.actorIds.map((id) => run.party.find((c) => c.id === id)!), rng: rngOf(run) };
}

export function eventTitle(run: RunState, pick: EventPick) {
  return textOf(pick.event.title, eventCtx(run, pick));
}

export function eventText(run: RunState, pick: EventPick) {
  return textOf(pick.event.text, eventCtx(run, pick));
}

export function choiceLabel(run: RunState, pick: EventPick, index: number) {
  return textOf(pick.event.choices[index].label, eventCtx(run, pick));
}

export function choiceDisabled(run: RunState, pick: EventPick, index: number): string | null {
  return pick.event.choices[index].disabled?.(eventCtx(run, pick)) ?? null;
}

export function resolveChoice(run: RunState, pick: EventPick, index: number): EventOutcome {
  return pick.event.choices[index].resolve(eventCtx(run, pick));
}
