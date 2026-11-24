// Types shared by the game server and the React client.

export type TeamId = string;

export interface TeamConfig {
  id: TeamId;
  name: string;
  color: string;
}

export interface ClueConfig {
  clue: string;
  answer: string;
}

export interface CategoryConfig {
  name: string;
  /** One clue per row, top to bottom. */
  clues: ClueConfig[];
}

export interface BoardConfig {
  title: string;
  /** Point value for each row, top to bottom. Its length is the number of rows. */
  values: number[];
  /** One entry per column. Its length is the number of columns. */
  categories: CategoryConfig[];
}

export interface GameSettings {
  /** 'manual': host opens buzzers after reading the clue. 'auto': they open on their own after a delay. */
  buzzerMode: 'manual' | 'auto';
  /** Seconds to wait before auto-opening buzzers. */
  autoOpenDelaySec: number;
  /** Subtract the clue value when a team answers wrong. */
  deductWrong: boolean;
  /** Pressing before buzzers open locks that phone out for this long (0 = off). */
  earlyBuzzLockoutMs: number;
  /** Shown before values, e.g. "$". Leave empty for plain points. */
  valuePrefix: string;
}

export interface GameSetup {
  board: BoardConfig;
  teams: TeamConfig[];
  settings: GameSettings;
}

export type Phase = 'setup' | 'lobby' | 'board' | 'clue' | 'results';

export interface BuzzEntry {
  teamId: TeamId;
  playerId: string;
  playerName: string;
  /** Time from the buzzers opening (as seen on that phone) to the press, latency-corrected. */
  reactionMs: number;
}

export type BuzzerStatus = 'locked' | 'open' | 'answering';

export interface BuzzerState {
  status: BuzzerStatus;
  /** Increments every time the buzzers open, so stale presses are ignored. */
  round: number;
  /** Ordered fastest first. While answering, queue[0] is the team that has the floor. */
  queue: BuzzEntry[];
  /** Teams that already answered this clue wrong. */
  lockedOut: TeamId[];
  /** Epoch ms when auto-open will fire, if scheduled. */
  autoOpenAt: number | null;
}

export interface CurrentClue {
  col: number;
  row: number;
  revealed: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  teamId: TeamId | null;
  connected: boolean;
}

export interface ScoreEvent {
  id: number;
  teamId: TeamId;
  delta: number;
  label: string;
}

export interface HostState {
  phase: Phase;
  setup: GameSetup;
  scores: Record<TeamId, number>;
  /** used[col][row] */
  used: boolean[][];
  current: CurrentClue | null;
  buzzer: BuzzerState;
  players: PlayerInfo[];
  history: ScoreEvent[];
  joinUrls: string[];
}

export interface PublicTeam extends TeamConfig {
  score: number;
}

export interface PublicClue {
  category: string;
  value: number;
  text: string;
  /** Only present once the host reveals it. */
  answer?: string;
}

export interface PublicState {
  phase: Phase;
  title: string;
  valuePrefix: string;
  earlyBuzzLockoutMs: number;
  teams: PublicTeam[];
  players: PlayerInfo[];
  buzzer: BuzzerState;
  clue: PublicClue | null;
}

export type JudgeResult = 'correct' | 'half' | 'wrong';

export type HostAction =
  | { type: 'saveSetup'; setup: GameSetup }
  | { type: 'goto'; phase: 'setup' | 'lobby' | 'board' | 'results' }
  | { type: 'openClue'; col: number; row: number }
  | { type: 'closeClue'; markUsed: boolean }
  | { type: 'revealAnswer'; revealed: boolean }
  | { type: 'openBuzzers' }
  | { type: 'lockBuzzers' }
  | { type: 'judge'; teamId: TeamId; result: JudgeResult }
  | { type: 'adjustScore'; teamId: TeamId; delta: number }
  | { type: 'undoScore' }
  | { type: 'toggleUsed'; col: number; row: number }
  | { type: 'kickPlayer'; playerId: string }
  | { type: 'newGame' };

export type Ack = { ok: true } | { ok: false; error: string };
export type JoinAck = { ok: true; player: PlayerInfo } | { ok: false; error: string };

export interface ServerToClientEvents {
  'host:state': (state: HostState) => void;
  'public:state': (state: PublicState) => void;
  'player:kicked': () => void;
  /** Latency probe: the client acknowledges right away so the server can measure round-trip time. */
  rtt: (ack: () => void) => void;
}

export interface ClientToServerEvents {
  'host:hello': (ack: (res: Ack) => void) => void;
  'host:action': (action: HostAction, ack: (res: Ack) => void) => void;
  'player:join': (
    data: { playerId: string; name: string; teamId: TeamId },
    ack: (res: JoinAck) => void,
  ) => void;
  'player:resume': (data: { playerId: string }, ack: (res: JoinAck) => void) => void;
  'player:leave': () => void;
  'player:buzz': (data: { round: number; reactionMs: number }) => void;
}
