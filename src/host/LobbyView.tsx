import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { HostState } from '../../shared/types.ts';
import { Icon } from '../components/Icon.tsx';
import { unlockAudio } from '../lib/sound.ts';
import { JoinPanel } from './JoinPanel.tsx';
import type { Dispatch } from './useHost.ts';

export function LobbyView({ state, dispatch }: { state: HostState; dispatch: Dispatch }) {
  const { teams, board } = state.setup;
  const unassigned = state.players.filter((p) => !p.teamId);

  return (
    <div className="lobby">
      <motion.h1
        className="lobby-title"
        initial={{ opacity: 0, scale: 0.8, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
      >
        {board.title}
      </motion.h1>

      <div className="lobby-grid">
        <motion.div
          className="card join-card"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <JoinPanel urls={state.joinUrls} size={260} />
        </motion.div>

        <div className="lobby-teams" style={{ '--teams': teams.length } as CSSProperties}>
          {teams.map((team, i) => {
            const members = state.players.filter((p) => p.teamId === team.id);
            return (
              <motion.div
                key={team.id}
                className="card team-card"
                style={{ '--team': team.color } as CSSProperties}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.06 }}
              >
                <h3>
                  {team.name} <span className="muted">{members.length}</span>
                </h3>
                <ul>
                  <AnimatePresence>
                    {members.map((m) => (
                      <motion.li
                        key={m.id}
                        layout
                        className={m.connected ? '' : 'is-offline'}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                      >
                        {m.name}
                        <button
                          className="kick"
                          onClick={() => dispatch({ type: 'kickPlayer', playerId: m.id })}
                          title={`Remove ${m.name}`}
                          aria-label={`Remove ${m.name}`}
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {members.length === 0 && <li className="placeholder">Waiting for players…</li>}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>

      {unassigned.length > 0 && (
        <p className="muted center">
          Picking a team: {unassigned.map((p) => p.name).join(', ')}
        </p>
      )}

      <footer className="lobby-footer">
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'goto', phase: 'setup' })}>
          <Icon name="back" /> Edit setup
        </button>
        <motion.button
          className="btn btn-primary btn-lg"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            unlockAudio();
            dispatch({ type: 'goto', phase: 'board' });
          }}
        >
          Start game <Icon name="next" />
        </motion.button>
      </footer>
    </div>
  );
}
