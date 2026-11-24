import type { BuzzEntry, PublicState } from '../../shared/types.ts';

export type BuzzerMode =
  | { kind: 'idle' }
  | { kind: 'done' }
  | { kind: 'out' }
  | { kind: 'floor'; entry: BuzzEntry }
  | { kind: 'line'; position: number }
  | { kind: 'wait' }
  | { kind: 'pressed' }
  | { kind: 'go'; someoneAnswering: boolean };

/** What this phone's buzzer should do right now. */
export function buzzerMode(s: PublicState, teamId: string, pressedRound: number): BuzzerMode {
  const b = s.buzzer;
  if (s.phase !== 'clue' || !s.clue) return { kind: 'idle' };
  if (b.status === 'locked' && s.clue.answer !== undefined) return { kind: 'done' };
  if (b.lockedOut.includes(teamId)) return { kind: 'out' };
  const index = b.queue.findIndex((e) => e.teamId === teamId);
  if (index === 0) return { kind: 'floor', entry: b.queue[0] };
  if (index > 0) return { kind: 'line', position: index + 1 };
  if (b.status === 'locked') return { kind: 'wait' };
  if (pressedRound === b.round) return { kind: 'pressed' };
  return { kind: 'go', someoneAnswering: b.status === 'answering' };
}
