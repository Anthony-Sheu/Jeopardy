import '../styles/host.css';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { BoardView } from './BoardView.tsx';
import { LobbyView } from './LobbyView.tsx';
import { ResultsView } from './ResultsView.tsx';
import { SetupView } from './SetupView.tsx';
import { useHost } from './useHost.ts';

const page: Variants = {
  initial: { opacity: 0, y: 30, scale: 0.98, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
    transitionEnd: { filter: 'none' },
  },
  exit: { opacity: 0, y: -24, scale: 1.02, filter: 'blur(8px)', transition: { duration: 0.28, ease: 'easeIn' } },
};

export function HostApp() {
  const { state, connected, denied, toast, dispatch } = useHost();

  if (denied) {
    return (
      <div className="center-screen">
        <div className="card notice">
          <h1>This is the host screen</h1>
          <p>{denied}</p>
          <a className="btn btn-primary" href="/">
            Join as a player
          </a>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="center-screen">
        <motion.div className="loader" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} />
      </div>
    );
  }

  // The clue is an overlay on top of the board, so both share one "page".
  const view = state.phase === 'clue' ? 'board' : state.phase;

  return (
    <div className="host">
      <AnimatePresence mode="wait">
        <motion.main key={view} className="view" variants={page} initial="initial" animate="animate" exit="exit">
          {view === 'setup' && <SetupView state={state} dispatch={dispatch} />}
          {view === 'lobby' && <LobbyView state={state} dispatch={dispatch} />}
          {view === 'board' && <BoardView state={state} dispatch={dispatch} />}
          {view === 'results' && <ResultsView state={state} dispatch={dispatch} />}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {!connected && (
          <motion.div className="conn-banner" initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }}>
            Lost connection to the game server. Is it still running? Reconnecting…
          </motion.div>
        )}
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
