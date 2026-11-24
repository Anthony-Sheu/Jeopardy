import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type CSSProperties } from 'react';
import { formatValue } from '../../shared/config.ts';
import type { HostState } from '../../shared/types.ts';
import { Icon } from '../components/Icon.tsx';
import { unlockAudio } from '../lib/sound.ts';
import { ClueOverlay } from './ClueOverlay.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { TopBar } from './TopBar.tsx';
import type { Dispatch } from './useHost.ts';

export function BoardView({ state, dispatch }: { state: HostState; dispatch: Dispatch }) {
  const { board, settings } = state.setup;
  const cols = board.categories.length;
  const rows = board.values.length;
  const remaining = state.used.flat().filter((u) => !u).length;

  // Random fill-in order for the board's entrance, like the TV show.
  const delays = useMemo(
    () => Array.from({ length: cols * rows }, () => 0.15 + Math.random() * 0.7),
    [cols, rows],
  );

  return (
    <div className="board-screen">
      <TopBar state={state}>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'goto', phase: 'setup' })}>
          <Icon name="settings" /> Setup
        </button>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'goto', phase: 'results' })}>
          <Icon name="trophy" /> Results
        </button>
      </TopBar>

      <div className="board-wrap">
        <div
          className="board"
          style={{ '--cols': cols, '--rows': rows } as CSSProperties}
          role="grid"
          aria-label="Game board"
        >
          {board.categories.map((cat, c) => (
            <motion.div
              key={`cat-${c}`}
              className="cat"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * c, duration: 0.4 }}
            >
              <span>{cat.name}</span>
            </motion.div>
          ))}
          {board.values.map((value, r) =>
            board.categories.map((cat, c) => {
              const key = `${c}-${r}`;
              const used = state.used[c]?.[r] ?? false;
              const empty = !cat.clues[r]?.clue.trim();
              return (
                <motion.button
                  key={key}
                  data-tile={key}
                  className={`tile ${used ? 'is-used' : ''} ${empty && !used ? 'is-empty' : ''}`}
                  initial={{ opacity: 0, scale: 0.5, rotateX: -80 }}
                  animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                  transition={{ delay: delays[r * cols + c], type: 'spring', stiffness: 260, damping: 22 }}
                  whileHover={used ? undefined : { scale: 1.04 }}
                  whileTap={used ? undefined : { scale: 0.97 }}
                  disabled={state.phase !== 'board'}
                  onClick={() => {
                    unlockAudio();
                    if (!used) dispatch({ type: 'openClue', col: c, row: r });
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    dispatch({ type: 'toggleUsed', col: c, row: r });
                  }}
                  title={used ? 'Right-click to put this clue back on the board' : `${cat.name} for ${formatValue(value, settings.valuePrefix)}`}
                  aria-label={used ? `${cat.name} ${value}, played` : `${cat.name} for ${value}`}
                >
                  {!used && <span className="tile-value">{formatValue(value, settings.valuePrefix)}</span>}
                </motion.button>
              );
            }),
          )}
        </div>

        <AnimatePresence>
          {remaining === 0 && state.phase === 'board' && (
            <motion.div
              className="board-done"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <h2>Board cleared!</h2>
              <button className="btn btn-primary btn-lg" onClick={() => dispatch({ type: 'goto', phase: 'results' })}>
                <Icon name="trophy" /> Show final scores
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Scoreboard state={state} dispatch={dispatch} />

      <AnimatePresence>
        {state.phase === 'clue' && state.current && (
          <ClueOverlay key={`clue-${state.current.col}-${state.current.row}`} state={state} dispatch={dispatch} />
        )}
      </AnimatePresence>
    </div>
  );
}
