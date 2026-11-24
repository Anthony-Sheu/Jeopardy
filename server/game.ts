// The authoritative game state. The host screen sends actions, phones send buzzes,
// and every change is broadcast back out by server/index.ts.
import { clamp, defaultSetup, formatValue, LIMITS, sanitizeSetup } from '../shared/config.ts';
import type {
  BuzzEntry,
  BuzzerState,
  CurrentClue,
  GameSetup,
  HostAction,
  HostState,
  JudgeResult,
  Phase,
  PlayerInfo,
  PublicState,
  ScoreEvent,
  TeamId,
} from '../shared/types.ts';

/**
 * After the first buzz arrives, wait this long for other buzzes before announcing
 * a winner. Presses inside the window are ranked by reaction time, so a phone on
 * a slower Wi-Fi link isn't punished for its network delay.
 */
export const SETTLE_MS = 150;
/** Extra slack added to a phone's measured round-trip time when checking its reported reaction time. */
export const RTT_MARGIN_MS = 60;
/** Assumed round-trip time before a phone has been measured. */
export const DEFAULT_RTT_MS = 250;
const MAX_HISTORY = 200;

export class GameError extends Error {}

interface Player {
  id: string;
  name: string;
  teamId: TeamId | null;
  sockets: Set<string>;
}

export interface SavedGame {
  phase: Phase;
  setup: GameSetup;
  scores: Record<TeamId, number>;
  used: boolean[][];
  history: ScoreEvent[];
  players: { id: string; name: string; teamId: TeamId | null }[];
}

const freshBuzzer = (round = 0): BuzzerState => ({
  status: 'locked',
  round,
  queue: [],
  lockedOut: [],
  autoOpenAt: null,
});

export class Game {
  phase: Phase = 'setup';
  setup: GameSetup = defaultSetup();
  scores: Record<TeamId, number> = {};
  used: boolean[][] = [];
  current: CurrentClue | null = null;
  buzzer: BuzzerState = freshBuzzer();
  history: ScoreEvent[] = [];

  private players = new Map<string, Player>();
  private socketToPlayer = new Map<string, string>();
  private openedAt = 0;
  private pending: BuzzEntry[] = [];
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private autoOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private nextEventId = 1;

  constructor(
    private readonly onChange: () => void,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.applySetup(this.setup);
  }

  // ---------------------------------------------------------------- persistence

  load(saved: Partial<SavedGame>): void {
    this.applySetup(saved.setup ?? this.setup);
    const phase = saved.phase === 'clue' ? 'board' : saved.phase;
    if (phase && ['setup', 'lobby', 'board', 'results'].includes(phase)) this.phase = phase;
    for (const team of this.setup.teams) {
      const score = saved.scores?.[team.id];
      if (typeof score === 'number' && Number.isFinite(score)) this.scores[team.id] = score;
    }
    if (Array.isArray(saved.used)) {
      this.used = this.used.map((col, c) => col.map((_, r) => saved.used?.[c]?.[r] === true));
    }
    if (Array.isArray(saved.history)) {
      this.history = saved.history.filter((e) => e && e.teamId in this.scores).slice(-MAX_HISTORY);
      this.nextEventId = Math.max(0, ...this.history.map((e) => e.id)) + 1;
    }
    for (const p of saved.players ?? []) {
      if (!p?.id || typeof p.name !== 'string') continue;
      const teamId = p.teamId && p.teamId in this.scores ? p.teamId : null;
      this.players.set(p.id, { id: p.id, name: p.name, teamId, sockets: new Set() });
    }
  }

  toSaved(): SavedGame {
    return {
      phase: this.phase === 'clue' ? 'board' : this.phase,
      setup: this.setup,
      scores: this.scores,
      used: this.used,
      history: this.history,
      players: [...this.players.values()].map(({ id, name, teamId }) => ({ id, name, teamId })),
    };
  }

  // ---------------------------------------------------------------- views

  playerList(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      teamId: p.teamId,
      connected: p.sockets.size > 0,
    }));
  }

  hostState(joinUrls: string[]): HostState {
    return {
      phase: this.phase,
      setup: this.setup,
      scores: this.scores,
      used: this.used,
      current: this.current,
      buzzer: this.buzzer,
      players: this.playerList(),
      history: this.history.slice(-30),
      joinUrls,
    };
  }

  publicState(): PublicState {
    const { board, teams, settings } = this.setup;
    let clue: PublicState['clue'] = null;
    if (this.phase === 'clue' && this.current) {
      const { col, row, revealed } = this.current;
      const c = board.categories[col].clues[row];
      clue = {
        category: board.categories[col].name,
        value: board.values[row],
        text: c.clue,
        ...(revealed ? { answer: c.answer } : {}),
      };
    }
    return {
      phase: this.phase,
      title: board.title,
      valuePrefix: settings.valuePrefix,
      earlyBuzzLockoutMs: settings.earlyBuzzLockoutMs,
      teams: teams.map((t) => ({ ...t, score: this.scores[t.id] ?? 0 })),
      players: this.playerList(),
      buzzer: this.buzzer,
      clue,
    };
  }

  // ---------------------------------------------------------------- host actions

  dispatch(action: HostAction): void {
    switch (action.type) {
      case 'saveSetup':
        if (this.phase !== 'setup' && this.phase !== 'lobby') throw new GameError('Go back to setup to edit the game.');
        this.applySetup(action.setup);
        return;
      case 'goto':
        if (!['setup', 'lobby', 'board', 'results'].includes(action.phase)) throw new GameError('Unknown screen.');
        return this.goto(action.phase);
      case 'openClue':
        return this.openClue(action.col, action.row);
      case 'closeClue':
        return this.closeClue(action.markUsed);
      case 'revealAnswer':
        if (!this.current) throw new GameError('No clue is open.');
        this.current = { ...this.current, revealed: !!action.revealed };
        return;
      case 'openBuzzers':
        if (this.phase !== 'clue') throw new GameError('Open a clue first.');
        return this.openBuzzers();
      case 'lockBuzzers':
        this.clearBuzzTimers();
        this.buzzer = { ...this.buzzer, status: 'locked', autoOpenAt: null };
        return;
      case 'judge':
        return this.judge(action.teamId, action.result);
      case 'adjustScore':
        this.requireTeam(action.teamId);
        if (!Number.isFinite(action.delta) || action.delta === 0) return;
        this.addScore(action.teamId, action.delta, 'Manual adjustment');
        return;
      case 'undoScore': {
        const last = this.history.pop();
        if (!last) throw new GameError('Nothing to undo.');
        if (last.teamId in this.scores) this.scores[last.teamId] -= last.delta;
        return;
      }
      case 'toggleUsed': {
        const { col, row } = action;
        if (this.used[col]?.[row] === undefined) throw new GameError('No such clue.');
        this.used[col][row] = !this.used[col][row];
        return;
      }
      case 'kickPlayer':
        this.players.delete(action.playerId);
        for (const [socketId, playerId] of this.socketToPlayer) {
          if (playerId === action.playerId) this.socketToPlayer.delete(socketId);
        }
        return;
      case 'newGame':
        for (const id of Object.keys(this.scores)) this.scores[id] = 0;
        this.used = this.used.map((col) => col.map(() => false));
        this.history = [];
        this.current = null;
        this.resetBuzzer();
        if (this.phase === 'clue' || this.phase === 'results') this.phase = 'board';
        return;
      default:
        throw new GameError('Unknown action.');
    }
  }

  private applySetup(input: unknown): void {
    const setup = sanitizeSetup(input);
    this.used = setup.board.categories.map((cat, c) => cat.clues.map((_, r) => this.used[c]?.[r] ?? false));
    const scores: Record<TeamId, number> = {};
    for (const team of setup.teams) scores[team.id] = this.scores[team.id] ?? 0;
    this.scores = scores;
    this.history = this.history.filter((e) => e.teamId in scores);
    for (const p of this.players.values()) {
      if (p.teamId && !(p.teamId in scores)) p.teamId = null;
    }
    this.setup = setup;
  }

  private goto(phase: 'setup' | 'lobby' | 'board' | 'results'): void {
    if (this.current) {
      this.current = null;
      this.resetBuzzer();
    }
    this.phase = phase;
  }

  private openClue(col: number, row: number): void {
    if (this.phase !== 'board') throw new GameError('The board is not showing.');
    if (this.used[col]?.[row] !== false) throw new GameError('That clue has already been played.');
    this.current = { col, row, revealed: false };
    this.phase = 'clue';
    this.resetBuzzer();
    const { buzzerMode, autoOpenDelaySec } = this.setup.settings;
    if (buzzerMode === 'auto') {
      const delay = Math.round(autoOpenDelaySec * 1000);
      this.buzzer.autoOpenAt = this.now() + delay;
      this.autoOpenTimer = setTimeout(() => {
        this.autoOpenTimer = null;
        if (this.phase === 'clue' && this.buzzer.status === 'locked') {
          this.openBuzzers();
          this.onChange();
        }
      }, delay);
    }
  }

  private closeClue(markUsed: boolean): void {
    if (!this.current) throw new GameError('No clue is open.');
    if (markUsed) this.used[this.current.col][this.current.row] = true;
    this.current = null;
    this.phase = 'board';
    this.resetBuzzer();
  }

  private judge(teamId: TeamId, result: JudgeResult): void {
    this.requireTeam(teamId);
    if (this.phase !== 'clue' || !this.current) throw new GameError('Open a clue first.');
    const { board, settings } = this.setup;
    const value = board.values[this.current.row];
    const category = board.categories[this.current.col].name;
    const tile = `${category} ${formatValue(value, settings.valuePrefix)}`;

    if (result === 'correct') this.addScore(teamId, value, `Correct · ${tile}`);
    if (result === 'half') this.addScore(teamId, value / 2, `Half points · ${tile}`);
    if (result === 'wrong' && settings.deductWrong) this.addScore(teamId, -value, `Wrong · ${tile}`);

    if (result !== 'wrong') {
      this.clearBuzzTimers();
      this.buzzer = { ...this.buzzer, status: 'locked', autoOpenAt: null };
      this.current = { ...this.current, revealed: true };
      return;
    }

    // Wrong answer: lock that team out, then hand the floor to the next team in line,
    // or reopen the buzzers for everyone who hasn't tried yet.
    const wasLocked = this.buzzer.status === 'locked';
    const lockedOut = this.buzzer.lockedOut.includes(teamId) ? this.buzzer.lockedOut : [...this.buzzer.lockedOut, teamId];
    const queue = this.buzzer.queue.filter((e) => e.teamId !== teamId);
    this.pending = this.pending.filter((e) => e.teamId !== teamId);
    this.buzzer = { ...this.buzzer, lockedOut, queue };
    if (queue.length > 0) {
      this.buzzer.status = 'answering';
    } else if (!wasLocked && this.setup.teams.some((t) => !lockedOut.includes(t.id))) {
      this.openBuzzers();
    } else {
      this.clearBuzzTimers();
      this.buzzer.status = 'locked';
    }
  }

  private openBuzzers(): void {
    this.clearBuzzTimers();
    this.pending = [];
    this.openedAt = this.now();
    this.buzzer = {
      ...this.buzzer,
      status: 'open',
      round: this.buzzer.round + 1,
      queue: [],
      autoOpenAt: null,
    };
  }

  private resetBuzzer(): void {
    this.clearBuzzTimers();
    this.pending = [];
    this.buzzer = freshBuzzer(this.buzzer.round);
  }

  private clearBuzzTimers(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.autoOpenTimer) clearTimeout(this.autoOpenTimer);
    this.settleTimer = null;
    this.autoOpenTimer = null;
    this.pending = [];
  }

  private addScore(teamId: TeamId, delta: number, label: string): void {
    this.scores[teamId] = (this.scores[teamId] ?? 0) + delta;
    this.history.push({ id: this.nextEventId++, teamId, delta, label });
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  private requireTeam(teamId: TeamId): void {
    if (!(teamId in this.scores)) throw new GameError('Unknown team.');
  }

  // ---------------------------------------------------------------- players

  joinPlayer(socketId: string, data: { playerId: string; name: string; teamId: TeamId }): PlayerInfo {
    const name = String(data.name ?? '').trim().slice(0, LIMITS.maxNameLength);
    const playerId = String(data.playerId ?? '').slice(0, 40);
    if (!playerId) throw new GameError('Missing player id.');
    if (!name) throw new GameError('Enter your name.');
    this.requireTeam(data.teamId);
    let player = this.players.get(playerId);
    if (!player) {
      if (this.players.size >= LIMITS.maxPlayers) throw new GameError('The game is full.');
      player = { id: playerId, name, teamId: data.teamId, sockets: new Set() };
      this.players.set(playerId, player);
    }
    player.name = name;
    player.teamId = data.teamId;
    this.attach(socketId, player);
    return this.info(player);
  }

  resumePlayer(socketId: string, playerId: string): PlayerInfo {
    const player = this.players.get(String(playerId ?? ''));
    if (!player) throw new GameError('Please join again.');
    if (player.teamId && !(player.teamId in this.scores)) player.teamId = null;
    this.attach(socketId, player);
    return this.info(player);
  }

  /** Removes the player entirely (they tapped "Leave"). */
  leave(socketId: string): void {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return;
    this.socketToPlayer.delete(socketId);
    this.players.delete(playerId);
  }

  disconnect(socketId: string): boolean {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) return false;
    this.socketToPlayer.delete(socketId);
    this.players.get(playerId)?.sockets.delete(socketId);
    return true;
  }

  socketsForPlayer(playerId: string): string[] {
    return [...this.socketToPlayer].filter(([, p]) => p === playerId).map(([s]) => s);
  }

  playerIdForSocket(socketId: string): string | undefined {
    return this.socketToPlayer.get(socketId);
  }

  private attach(socketId: string, player: Player): void {
    const previous = this.socketToPlayer.get(socketId);
    if (previous && previous !== player.id) this.players.get(previous)?.sockets.delete(socketId);
    this.socketToPlayer.set(socketId, player.id);
    player.sockets.add(socketId);
  }

  private info(p: Player): PlayerInfo {
    return { id: p.id, name: p.name, teamId: p.teamId, connected: p.sockets.size > 0 };
  }

  // ---------------------------------------------------------------- buzzing

  /**
   * Handle a buzzer press.
   *
   * Each phone reports its reaction time: how long after *it* saw the buzzers open
   * the player pressed. That cancels out Wi-Fi delay in both directions. To stop a
   * phone from claiming an impossibly fast time, the reported value must fit inside
   * what the server observed (time since opening, minus that phone's round-trip time).
   *
   * Returns true when the press was accepted.
   */
  buzz(socketId: string, round: number, reportedMs: number, rttMs: number = DEFAULT_RTT_MS): boolean {
    const b = this.buzzer;
    if (this.phase !== 'clue' || b.status === 'locked' || round !== b.round) return false;
    const playerId = this.socketToPlayer.get(socketId);
    const player = playerId ? this.players.get(playerId) : undefined;
    const teamId = player?.teamId;
    if (!player || !teamId || !(teamId in this.scores)) return false;
    if (b.lockedOut.includes(teamId) || b.queue.some((e) => e.teamId === teamId)) return false;

    const elapsed = Math.max(0, this.now() - this.openedAt);
    const earliest = Math.max(0, elapsed - rttMs - RTT_MARGIN_MS);
    const reported = Number.isFinite(reportedMs) ? reportedMs : elapsed;
    const reactionMs = Math.round(clamp(reported, earliest, elapsed));

    const entry: BuzzEntry = { teamId, playerId: player.id, playerName: player.name, reactionMs };
    const existing = this.pending.findIndex((e) => e.teamId === teamId);
    if (existing >= 0) {
      // A teammate already pressed; keep whichever of them was quicker.
      if (reactionMs < this.pending[existing].reactionMs) this.pending[existing] = entry;
      return true;
    }
    this.pending.push(entry);
    if (!this.settleTimer) {
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.flushPending();
        this.onChange();
      }, SETTLE_MS);
    }
    return true;
  }

  /** Visible for tests: rank the presses collected during the settle window. */
  flushPending(): void {
    if (this.pending.length === 0 || this.phase !== 'clue' || this.buzzer.status === 'locked') {
      this.pending = [];
      return;
    }
    const byReaction = (a: BuzzEntry, b: BuzzEntry) => a.reactionMs - b.reactionMs;
    const incoming = this.pending.filter((e) => !this.buzzer.queue.some((q) => q.teamId === e.teamId));
    this.pending = [];
    if (this.buzzer.status === 'open') {
      this.buzzer = { ...this.buzzer, status: 'answering', queue: incoming.sort(byReaction) };
    } else {
      // Someone already has the floor; later presses line up behind them.
      const [active, ...rest] = this.buzzer.queue;
      this.buzzer = { ...this.buzzer, queue: [active, ...[...rest, ...incoming].sort(byReaction)] };
    }
  }
}
