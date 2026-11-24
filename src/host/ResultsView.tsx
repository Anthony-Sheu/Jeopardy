import { motion } from 'motion/react';
import { useEffect, useMemo, type CSSProperties } from 'react';
import type { HostState } from '../../shared/types.ts';
import { AnimatedNumber } from '../components/AnimatedNumber.tsx';
import { Icon } from '../components/Icon.tsx';
import { sounds } from '../lib/sound.ts';
import type { Dispatch } from './useHost.ts';

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        duration: 2.6 + Math.random() * 2,
        rotate: Math.random() * 720 - 360,
        color: ['#ffcc00', '#ffffff', '#ff5a5f', '#2ec4b6', '#a66cff', '#5ac8fa'][i % 6],
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <motion.i
          key={p.id}
          style={{ left: `${p.left}%`, background: p.color }}
          initial={{ y: '-10vh', rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.rotate, opacity: [1, 1, 0.8] }}
          transition={{ delay: 0.8 + p.delay, duration: p.duration, ease: 'easeIn', repeat: Infinity, repeatDelay: 1 }}
        />
      ))}
    </div>
  );
}

export function ResultsView({ state, dispatch }: { state: HostState; dispatch: Dispatch }) {
  const { teams, settings } = state.setup;
  const ranked = [...teams].sort((a, b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0));
  const top = state.scores[ranked[0]?.id] ?? 0;
  const winners = ranked.filter((t) => (state.scores[t.id] ?? 0) === top);
  const max = Math.max(1, ...ranked.map((t) => state.scores[t.id] ?? 0));

  useEffect(() => {
    const t = setTimeout(() => sounds.fanfare(), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="results">
      <Confetti />
      <motion.p className="results-kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        Final scores
      </motion.p>
      <motion.h1
        className="results-title"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.3 }}
      >
        {winners.length > 1 ? "It's a tie!" : `${winners[0]?.name} wins!`}
      </motion.h1>

      <ol className="results-list">
        {ranked.map((team, i) => {
          const score = state.scores[team.id] ?? 0;
          const isWinner = winners.includes(team);
          return (
            <motion.li
              key={team.id}
              className={isWinner ? 'is-winner' : ''}
              style={{ '--team': team.color } as CSSProperties}
              initial={{ opacity: 0, x: -60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + (ranked.length - i) * 0.12, type: 'spring', stiffness: 220, damping: 22 }}
            >
              <span className="rank">{i + 1}</span>
              <span className="name">{team.name}</span>
              <span className="bar">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${(Math.max(0, score) / max) * 100}%` }}
                  transition={{ delay: 0.9 + (ranked.length - i) * 0.12, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
              <span className={`score ${score < 0 ? 'neg' : ''}`}>
                <AnimatedNumber value={score} prefix={settings.valuePrefix} />
              </span>
            </motion.li>
          );
        })}
      </ol>

      <footer className="results-footer">
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'goto', phase: 'board' })}>
          <Icon name="back" /> Back to board
        </button>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'goto', phase: 'setup' })}>
          <Icon name="settings" /> Edit setup
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (confirm('Start a new game? Scores reset and every clue goes back on the board.')) {
              dispatch({ type: 'newGame' });
            }
          }}
        >
          <Icon name="refresh" /> Play again
        </button>
      </footer>
    </div>
  );
}
