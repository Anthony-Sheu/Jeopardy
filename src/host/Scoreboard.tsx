import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatValue } from '../../shared/config.ts';
import type { HostState, TeamId } from '../../shared/types.ts';
import { AnimatedNumber } from '../components/AnimatedNumber.tsx';
import { Modal } from '../components/Modal.tsx';
import type { Dispatch } from './useHost.ts';

interface Popup {
  id: number;
  teamId: TeamId;
  delta: number;
}

/** Team podiums along the bottom of the board, with floating +/- popups. */
export function Scoreboard({ state, dispatch }: { state: HostState; dispatch: Dispatch }) {
  const { teams, settings } = state.setup;
  const prefix = settings.valuePrefix;
  const prev = useRef(state.scores);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [editing, setEditing] = useState<TeamId | null>(null);
  const [amount, setAmount] = useState(100);

  useEffect(() => {
    const fresh: Popup[] = [];
    for (const team of teams) {
      const before = prev.current[team.id] ?? 0;
      const after = state.scores[team.id] ?? 0;
      if (before !== after) fresh.push({ id: Math.random(), teamId: team.id, delta: after - before });
    }
    prev.current = state.scores;
    if (!fresh.length) return;
    setPopups((p) => [...p, ...fresh]);
    setTimeout(() => setPopups((p) => p.filter((x) => !fresh.includes(x))), 1600);
  }, [state.scores, teams]);

  const activeTeam = state.phase === 'clue' ? state.buzzer.queue[0]?.teamId : undefined;
  const editingTeam = teams.find((t) => t.id === editing);

  return (
    <>
      <div className="scoreboard" style={{ '--teams': teams.length } as CSSProperties}>
        {teams.map((team) => {
          const score = state.scores[team.id] ?? 0;
          const members = state.players.filter((p) => p.teamId === team.id);
          const isActive = team.id === activeTeam;
          const isOut = state.phase === 'clue' && state.buzzer.lockedOut.includes(team.id);
          return (
            <motion.button
              key={team.id}
              layout
              className={`podium ${isActive ? 'is-active' : ''} ${isOut ? 'is-out' : ''}`}
              style={{ '--team': team.color } as CSSProperties}
              onClick={() => setEditing(team.id)}
              title="Click to adjust score"
              animate={isActive ? { y: -8, scale: 1.04 } : { y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <span className="podium-name">{team.name}</span>
              <span className={`podium-score ${score < 0 ? 'neg' : ''}`}>
                <AnimatedNumber value={score} prefix={prefix} />
              </span>
              <span className="podium-members">
                {members.length === 0
                  ? 'No players'
                  : members.map((m) => (
                      <i key={m.id} className={m.connected ? 'on' : 'off'} title={m.name} />
                    ))}
              </span>
              <AnimatePresence>
                {popups
                  .filter((p) => p.teamId === team.id)
                  .map((p) => (
                    <motion.span
                      key={p.id}
                      className={`score-popup ${p.delta < 0 ? 'neg' : ''}`}
                      initial={{ opacity: 0, y: 10, scale: 0.6 }}
                      animate={{ opacity: 1, y: -46, scale: 1.1 }}
                      exit={{ opacity: 0, y: -70 }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    >
                      {p.delta > 0 ? '+' : ''}
                      {formatValue(p.delta, prefix)}
                    </motion.span>
                  ))}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      <Modal open={!!editingTeam} onClose={() => setEditing(null)} title={`Adjust ${editingTeam?.name ?? ''}`}>
        {editingTeam && (
          <div className="adjust">
            <p className="muted">
              Current score: <strong>{formatValue(state.scores[editingTeam.id] ?? 0, prefix)}</strong>
            </p>
            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                autoFocus
              />
            </label>
            <div className="adjust-quick">
              {state.setup.board.values.map((v) => (
                <button key={v} className="chip" onClick={() => setAmount(v)}>
                  {formatValue(v, prefix)}
                </button>
              ))}
            </div>
            <div className="adjust-actions">
              <button
                className="btn btn-danger"
                onClick={() => dispatch({ type: 'adjustScore', teamId: editingTeam.id, delta: -Math.abs(amount) })}
              >
                − Subtract
              </button>
              <button
                className="btn"
                onClick={() => dispatch({ type: 'adjustScore', teamId: editingTeam.id, delta: Math.abs(amount) / 2 })}
              >
                + Half
              </button>
              <button
                className="btn btn-primary"
                onClick={() => dispatch({ type: 'adjustScore', teamId: editingTeam.id, delta: Math.abs(amount) })}
              >
                + Add
              </button>
            </div>
            {state.history.length > 0 && (
              <div className="history">
                <p className="muted small">Recent scoring</p>
                <ul>
                  {state.history
                    .slice(-6)
                    .reverse()
                    .map((e) => (
                      <li key={e.id}>
                        <span>{teams.find((t) => t.id === e.teamId)?.name}</span>
                        <span className="muted">{e.label}</span>
                        <span className={e.delta < 0 ? 'neg' : 'pos'}>
                          {e.delta > 0 ? '+' : ''}
                          {formatValue(e.delta, prefix)}
                        </span>
                      </li>
                    ))}
                </ul>
                <button className="btn btn-ghost" onClick={() => dispatch({ type: 'undoScore' })}>
                  Undo last
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
