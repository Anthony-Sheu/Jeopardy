import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatValue } from '../../shared/config.ts';
import type { HostState, JudgeResult, TeamId } from '../../shared/types.ts';
import { AnimatedNumber } from '../components/AnimatedNumber.tsx';
import { Icon } from '../components/Icon.tsx';
import { sounds } from '../lib/sound.ts';
import type { Dispatch } from './useHost.ts';

const FULL_SCREEN = 'inset(0px 0px 0px 0px round 0px)';

/** A clip-path that shows only the board tile at (col, row). */
function clipForTile(col: number, row: number): string {
  const el = document.querySelector(`[data-tile="${col}-${row}"]`);
  if (!el) {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    return `inset(${y}px ${x}px ${y}px ${x}px round 6px)`;
  }
  const r = el.getBoundingClientRect();
  const right = window.innerWidth - r.right;
  const bottom = window.innerHeight - r.bottom;
  return `inset(${r.top}px ${right}px ${bottom}px ${r.left}px round 6px)`;
}

/** The full-screen clue that zooms out of its tile, plus the host's controls. */
export function ClueOverlay({ state, dispatch }: { state: HostState; dispatch: Dispatch }) {
  const { col, row, revealed } = state.current!;
  const { board, teams, settings } = state.setup;
  const category = board.categories[col];
  const clue = category.clues[row];
  const value = board.values[row];
  const prefix = settings.valuePrefix;
  const b = state.buzzer;
  const active = b.status === 'answering' ? b.queue[0] : undefined;
  const activeTeam = teams.find((t) => t.id === active?.teamId);

  // The overlay grows out of (and shrinks back into) the tile that was picked.
  const [tileClip] = useState(() => clipForTile(col, row));

  // Sound cues.
  const lastActive = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (active && active.teamId !== lastActive.current) sounds.buzz();
    lastActive.current = active?.teamId;
  }, [active]);
  const lastOpenRound = useRef(b.round);
  useEffect(() => {
    if (b.status === 'open' && b.round !== lastOpenRound.current) sounds.open();
    lastOpenRound.current = b.round;
  }, [b.status, b.round]);

  // Auto-open countdown.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!b.autoOpenAt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [b.autoOpenAt]);
  const countdown = b.autoOpenAt ? Math.max(0, Math.ceil((b.autoOpenAt - now) / 1000)) : null;

  const judge = (teamId: TeamId, result: JudgeResult) => {
    if (result === 'wrong') sounds.wrong();
    else sounds.correct();
    dispatch({ type: 'judge', teamId, result });
  };
  const close = (markUsed = true) => dispatch({ type: 'closeClue', markUsed });
  const reveal = () => {
    if (!revealed) sounds.reveal();
    dispatch({ type: 'revealAnswer', revealed: !revealed });
  };

  // Keyboard shortcuts for the host.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (key === ' ') {
      e.preventDefault();
      if (b.status === 'locked') dispatch({ type: 'openBuzzers' });
    } else if (key === 'a') reveal();
    else if (key === 'escape') close(true);
    else if (active && key === 'c') judge(active.teamId, 'correct');
    else if (active && key === 'h') judge(active.teamId, 'half');
    else if (active && key === 'w') judge(active.teamId, 'wrong');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const statusText =
    b.status === 'open'
      ? 'Buzzers are open!'
      : b.status === 'answering'
        ? `${activeTeam?.name ?? 'A team'} has the floor`
        : countdown !== null
          ? `Buzzers open in ${countdown}…`
          : revealed
            ? 'Buzzers locked'
            : 'Read the clue, then open the buzzers';

  return (
    <motion.div
      className="clue-overlay"
      initial={{ clipPath: tileClip }}
      animate={{ clipPath: FULL_SCREEN }}
      exit={{ clipPath: tileClip, transition: { duration: 0.45, ease: [0.65, 0, 0.35, 1], delay: 0.1 } }}
      transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
    >
      <motion.div
        className="clue-content"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1, transition: { delay: 0.4, duration: 0.35 } }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
      >
        <header className="clue-header">
          <span className="clue-category">{category.name}</span>
          <span className="clue-value">{formatValue(value, prefix)}</span>
          <button className="icon-btn on-blue" onClick={() => close(false)} title="Close without using this clue">
            <Icon name="close" />
          </button>
        </header>

        <div className="clue-body">
          <p className="clue-text">{clue.clue.trim() || '(This clue is empty. Add it in Setup.)'}</p>
          <AnimatePresence>
            {revealed && (
              <motion.p
                className="clue-answer"
                initial={{ opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                {clue.answer || '(no answer written)'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="popLayout">
          {active && activeTeam && (
            <motion.div
              key={`${active.teamId}-${b.round}`}
              className="buzz-banner"
              style={{ '--team': activeTeam.color } as CSSProperties}
              initial={{ opacity: 0, scale: 0.6, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            >
              <span className="buzz-team">{activeTeam.name}</span>
              <span className="buzz-player">{active.playerName} buzzed in!</span>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="clue-controls" aria-label="Host controls">
          <div className="buzzer-row">
            <motion.span
              className={`buzzer-status status-${b.status}`}
              key={statusText}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Icon name={b.status === 'locked' ? 'lock' : 'bolt'} /> {statusText}
            </motion.span>
            <ol className="buzz-queue">
              <AnimatePresence initial={false}>
                {b.queue.map((entry, i) => {
                  const team = teams.find((t) => t.id === entry.teamId);
                  const gap = (entry.reactionMs - b.queue[0].reactionMs) / 1000;
                  return (
                    <motion.li
                      key={entry.teamId}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      style={{ '--team': team?.color } as CSSProperties}
                    >
                      <b>{i + 1}</b> {team?.name} <span className="muted">· {entry.playerName}</span>
                      {i > 0 && <span className="gap">+{gap.toFixed(2)}s</span>}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
            <div className="buzzer-buttons">
              {b.status === 'locked' ? (
                <button className="btn btn-primary" onClick={() => dispatch({ type: 'openBuzzers' })}>
                  <Icon name="bolt" /> {b.round > 0 && b.queue.length ? 'Reopen' : 'Open'} buzzers <kbd>Space</kbd>
                </button>
              ) : (
                <button className="btn" onClick={() => dispatch({ type: 'lockBuzzers' })}>
                  <Icon name="lock" /> Lock buzzers
                </button>
              )}
            </div>
          </div>

          <div className="judge-grid" style={{ '--teams': teams.length } as CSSProperties}>
            {teams.map((team) => {
              const isActive = team.id === active?.teamId;
              const isOut = b.lockedOut.includes(team.id);
              return (
                <motion.div
                  key={team.id}
                  className={`judge-card ${isActive ? 'is-active' : ''} ${isOut ? 'is-out' : ''}`}
                  style={{ '--team': team.color } as CSSProperties}
                  layout
                >
                  <div className="judge-head">
                    <span className="judge-name">{team.name}</span>
                    <span className={`judge-score ${(state.scores[team.id] ?? 0) < 0 ? 'neg' : ''}`}>
                      <AnimatedNumber value={state.scores[team.id] ?? 0} prefix={prefix} />
                    </span>
                  </div>
                  <div className="judge-buttons">
                    <button className="jb jb-correct" onClick={() => judge(team.id, 'correct')} title={isActive ? 'Correct (C)' : 'Correct'}>
                      <Icon name="check" size={16} /> {formatValue(value, prefix)}
                    </button>
                    <button className="jb jb-half" onClick={() => judge(team.id, 'half')} title={isActive ? 'Half points (H)' : 'Half points'}>
                      ½ {formatValue(value / 2, prefix)}
                    </button>
                    <button className="jb jb-wrong" onClick={() => judge(team.id, 'wrong')} title={isActive ? 'Wrong (W)' : 'Wrong'}>
                      <Icon name="close" size={16} /> {settings.deductWrong ? formatValue(-value, prefix) : 'Wrong'}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="clue-footer">
            <button className="btn" onClick={reveal}>
              <Icon name="eye" /> {revealed ? 'Hide answer' : 'Reveal answer'} <kbd>A</kbd>
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => dispatch({ type: 'undoScore' })}
              disabled={state.history.length === 0}
            >
              <Icon name="undo" /> Undo score
            </button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => close(true)}>
              Back to board <kbd>Esc</kbd>
            </button>
          </div>
        </section>
      </motion.div>
    </motion.div>
  );
}
