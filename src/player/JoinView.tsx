import { motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { LIMITS } from '../../shared/config.ts';
import type { PlayerInfo, PublicState, TeamId } from '../../shared/types.ts';
import { Icon } from '../components/Icon.tsx';

export function JoinView({
  pub,
  me,
  savedName,
  notice,
  onJoin,
  onCancel,
}: {
  pub: PublicState;
  me: PlayerInfo | null;
  savedName: string;
  notice: string | null;
  onJoin: (name: string, teamId: TeamId) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(me?.name ?? savedName);
  const [picked, setPicked] = useState<TeamId | null>(me?.teamId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const teamId = pub.teams.some((t) => t.id === picked) ? picked : null;
  const canJoin = name.trim().length > 0 && teamId !== null && !busy;

  const submit = async () => {
    if (!canJoin || !teamId) return;
    setBusy(true);
    setError(await onJoin(name.trim(), teamId));
    setBusy(false);
  };

  return (
    <form
      className="join"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <motion.h1
        className="join-title"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
      >
        {pub.title}
      </motion.h1>

      {notice && <p className="join-notice">{notice}</p>}

      <label className="field">
        <span>Your name</span>
        <input
          value={name}
          maxLength={LIMITS.maxNameLength}
          autoComplete="nickname"
          enterKeyHint="done"
          placeholder="e.g. Alex"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="field">
        <span>Pick your team</span>
        <div className="team-picker">
          {pub.teams.map((t, i) => {
            const members = pub.players.filter((p) => p.teamId === t.id && p.id !== me?.id);
            const selected = t.id === teamId;
            return (
              <motion.button
                type="button"
                key={t.id}
                className={`team-pick ${selected ? 'is-selected' : ''}`}
                style={{ '--team': t.color } as CSSProperties}
                onClick={() => setPicked(t.id)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                whileTap={{ scale: 0.96 }}
              >
                <span className="team-pick-name">{t.name}</span>
                <span className="team-pick-members">
                  {members.length ? members.map((m) => m.name).join(', ') : 'No one yet'}
                </span>
                {selected && (
                  <motion.span layoutId="team-check" className="team-check">
                    <Icon name="check" size={16} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {error && <p className="join-error">{error}</p>}

      <motion.button type="submit" className="btn btn-primary btn-lg join-btn" disabled={!canJoin} whileTap={{ scale: 0.97 }}>
        {me?.teamId ? 'Switch team' : 'Join game'}
      </motion.button>
      {onCancel && (
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}
