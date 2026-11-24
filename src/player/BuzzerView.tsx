import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatValue } from '../../shared/config.ts';
import type { PlayerInfo, PublicState } from '../../shared/types.ts';
import { AnimatedNumber } from '../components/AnimatedNumber.tsx';
import { buzzerMode, type BuzzerMode } from './buzzerMode.ts';
import { latestState, sendBuzz } from './usePlayer.ts';

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
};

function describe(mode: BuzzerMode, pub: PublicState, me: PlayerInfo, tooEarly: boolean) {
  if (tooEarly) return { label: 'Too early!', status: 'Wait for the buzzers to open' };
  switch (mode.kind) {
    case 'idle':
      return {
        label: 'Standby',
        status:
          pub.phase === 'results'
            ? 'Game over! Check the big screen.'
            : pub.phase === 'board'
              ? 'Waiting for the next clue'
              : 'Waiting for the host to start',
      };
    case 'done':
      return { label: 'Done', status: 'Waiting for the next clue' };
    case 'out':
      return { label: 'Locked', status: 'Your team already answered this one' };
    case 'floor':
      return mode.entry.playerId === me.id
        ? { label: "You're up!", status: 'You buzzed in first. Answer now!' }
        : { label: 'Answer!', status: `${mode.entry.playerName} buzzed in for your team` };
    case 'line':
      return { label: `#${mode.position}`, status: `You're number ${mode.position} in line` };
    case 'wait':
      return { label: 'Wait', status: 'Get ready… buzzers open soon' };
    case 'pressed':
      return { label: 'Buzzed!', status: 'Checking who was first…' };
    case 'go':
      return {
        label: 'BUZZ!',
        status: mode.someoneAnswering ? 'Someone is answering. Buzz to get in line.' : 'Buzzers are open!',
      };
  }
}

export function BuzzerView({
  pub,
  me,
  onSwitchTeam,
  onLeave,
}: {
  pub: PublicState;
  me: PlayerInfo;
  onSwitchTeam: () => void;
  onLeave: () => void;
}) {
  const team = pub.teams.find((t) => t.id === me.teamId)!;
  const [pressedRound, setPressedRound] = useState(-1);
  const pressedRef = useRef(-1);
  const lockedUntil = useRef(0);
  const [tooEarly, setTooEarly] = useState(false);
  const earlyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mode = buzzerMode(pub, team.id, pressedRound);
  const { label, status } = describe(mode, pub, me, tooEarly);

  const flashEarly = useCallback(() => {
    setTooEarly(true);
    clearTimeout(earlyTimer.current);
    earlyTimer.current = setTimeout(() => setTooEarly(false), 700);
  }, []);

  const press = useCallback(
    (timeStamp: number) => {
      // Decide from the very latest server state, not the last render, so a press
      // in the instant between "buzzers open" arriving and the screen repainting counts.
      const s = latestState() ?? pub;
      const current = buzzerMode(s, team.id, pressedRef.current);
      const now = performance.now();
      if (current.kind === 'go') {
        if (now < lockedUntil.current) {
          flashEarly();
          return;
        }
        sendBuzz(s.buzzer.round, timeStamp);
        pressedRef.current = s.buzzer.round;
        setPressedRound(s.buzzer.round);
        vibrate(35);
      } else if (current.kind === 'wait' && s.earlyBuzzLockoutMs > 0) {
        lockedUntil.current = now + s.earlyBuzzLockoutMs;
        flashEarly();
        vibrate([15, 30, 15]);
      }
    },
    [pub, team.id, flashEarly],
  );

  // Big buzz when it's your turn to answer.
  const floorKey = mode.kind === 'floor' ? `${pub.buzzer.round}-${mode.entry.playerId}` : null;
  useEffect(() => {
    if (floorKey) vibrate([80, 60, 160]);
  }, [floorKey]);

  // Keyboard players: Space or Enter buzzes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
      if (e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      press(performance.now());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const myScore = team.score;
  const active = mode.kind === 'go';
  const isTurn = mode.kind === 'floor';

  return (
    <div className="buzzer-screen" style={{ '--team': team.color } as CSSProperties}>
      <header className="pb-header">
        <div className="pb-who">
          <span className="pb-dot" />
          <div>
            <strong>{team.name}</strong>
            <span className="muted"> · {me.name}</span>
          </div>
        </div>
        <div className="pb-score">
          <AnimatedNumber value={myScore} prefix={pub.valuePrefix} />
        </div>
      </header>

      <AnimatePresence mode="wait">
        {pub.clue && (
          <motion.section
            key={`${pub.clue.category}-${pub.clue.value}-${pub.clue.text}`}
            className="pb-clue"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <p className="pb-clue-meta">
              {pub.clue.category} · <b>{formatValue(pub.clue.value, pub.valuePrefix)}</b>
            </p>
            <p className="pb-clue-text">{pub.clue.text}</p>
            {pub.clue.answer !== undefined && (
              <motion.p className="pb-clue-answer" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                {pub.clue.answer}
              </motion.p>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <div className="pb-stage">
        <motion.button
          className={`buzzer mode-${tooEarly ? 'early' : mode.kind} ${label.length > 6 ? 'long-label' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            press(e.timeStamp);
          }}
          onContextMenu={(e) => e.preventDefault()}
          animate={
            tooEarly
              ? { x: [0, -14, 14, -10, 10, 0], scale: 1 }
              : isTurn
                ? { scale: [1, 1.06, 1], x: 0 }
                : { scale: active ? 1 : 0.92, x: 0 }
          }
          transition={isTurn ? { repeat: Infinity, duration: 0.9 } : { duration: 0.35 }}
          whileTap={active ? { scale: 0.9 } : undefined}
          aria-label="Buzzer"
        >
          {active && <span className="buzzer-ring" />}
          <AnimatePresence mode="wait">
            <motion.span
              key={label}
              className="buzzer-label"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.15 }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            className="pb-status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {status}
          </motion.p>
        </AnimatePresence>
      </div>

      <footer className="pb-footer">
        <ul className="pb-scores">
          {[...pub.teams]
            .sort((a, b) => b.score - a.score)
            .map((t) => (
              <motion.li key={t.id} layout style={{ '--team': t.color } as CSSProperties} className={t.id === team.id ? 'is-me' : ''}>
                <span>{t.name}</span>
                <b className={t.score < 0 ? 'neg' : ''}>{formatValue(t.score, pub.valuePrefix)}</b>
              </motion.li>
            ))}
        </ul>
        <div className="pb-actions">
          <button className="btn btn-ghost" onClick={onSwitchTeam}>
            Switch team
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Leave the game?')) onLeave();
            }}
          >
            Leave
          </button>
        </div>
      </footer>
    </div>
  );
}
