import { useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';
import { Modal } from '../components/Modal.tsx';
import { isMuted, setMuted } from '../lib/sound.ts';
import { JoinPanel } from './JoinPanel.tsx';
import type { HostState } from '../../shared/types.ts';

export function TopBar({ state, children }: { state: HostState; children?: ReactNode }) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const online = state.players.filter((p) => p.connected).length;

  return (
    <header className="topbar">
      <h1 className="topbar-title">{state.setup.board.title}</h1>
      <div className="topbar-actions">
        <button className="btn btn-ghost" onClick={() => setJoinOpen(true)} title="Show how to join">
          <Icon name="qr" /> Join
          <span className="badge">
            <Icon name="users" size={14} /> {online}
          </span>
        </button>
        {children}
        <button
          className="icon-btn"
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        >
          <Icon name={muted ? 'mute' : 'volume'} />
        </button>
      </div>
      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Join the game" wide>
        <JoinPanel urls={state.joinUrls} size={260} />
      </Modal>
    </header>
  );
}
