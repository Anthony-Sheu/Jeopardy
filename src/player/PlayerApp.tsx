import '../styles/player.css';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { BuzzerView } from './BuzzerView.tsx';
import { JoinView } from './JoinView.tsx';
import { usePlayer } from './usePlayer.ts';

export function PlayerApp() {
  const { pub, me, connected, notice, savedName, join, leave } = usePlayer();
  const [switching, setSwitching] = useState(false);

  if (!pub) {
    return (
      <div className="center-screen">
        <motion.div className="loader" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
        <p className="muted">Connecting to the game…</p>
      </div>
    );
  }

  const joined = !!me?.teamId && pub.teams.some((t) => t.id === me.teamId);
  const view = joined && !switching ? 'buzzer' : 'join';

  return (
    <div className="player">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          className="pview"
          initial={{ opacity: 0, x: view === 'buzzer' ? 60 : -60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: view === 'buzzer' ? -60 : 60 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {view === 'join' ? (
            <JoinView
              pub={pub}
              me={me}
              savedName={savedName}
              notice={notice}
              onJoin={async (name, teamId) => {
                const error = await join(name, teamId);
                if (!error) setSwitching(false);
                return error;
              }}
              onCancel={joined ? () => setSwitching(false) : undefined}
            />
          ) : (
            <BuzzerView pub={pub} me={me!} onSwitchTeam={() => setSwitching(true)} onLeave={leave} />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {!connected && (
          <motion.div className="reconnect" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="loader" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
            <p>Reconnecting…</p>
            <p className="muted small">Make sure you're on the same Wi-Fi as the host.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
