import { useCallback, useEffect, useState } from 'react';
import { makeId } from '../../shared/config.ts';
import type { PublicState, TeamId } from '../../shared/types.ts';
import { socket } from '../socket.ts';

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`jeopardy:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(`jeopardy:${key}`);
      else localStorage.setItem(`jeopardy:${key}`, value);
    } catch {
      /* private mode etc. */
    }
  },
};

const playerId = (() => {
  let id = store.get('playerId');
  if (!id) {
    id = makeId();
    store.set('playerId', id);
  }
  return id;
})();

// ---------------------------------------------------------------- buzz timing
// Tracked outside React so the moment the buzzers open is recorded the instant
// the message arrives, not whenever React gets around to re-rendering.

let seenRound = -1;
let openSeenAt = 0;
let latest: PublicState | null = null;
socket.on('public:state', (s) => {
  latest = s;
  if (s.buzzer.status !== 'locked' && s.buzzer.round !== seenRound) {
    seenRound = s.buzzer.round;
    openSeenAt = performance.now();
  }
});

/** The most recent state from the server, read at the instant of a press. */
export const latestState = () => latest;

/** Send a buzz. `pressedAt` should be the pointer event's timeStamp for best accuracy. */
export function sendBuzz(round: number, pressedAt: number): void {
  const now = performance.now();
  // event.timeStamp shares performance.now()'s clock in modern browsers; fall back if it doesn't look like it.
  const t = Math.abs(now - pressedAt) < 1000 ? pressedAt : now;
  const reactionMs = round === seenRound ? Math.max(0, t - openSeenAt) : 0;
  socket.emit('player:buzz', { round, reactionMs });
}

// ---------------------------------------------------------------- hook

export function usePlayer() {
  const [pub, setPub] = useState<PublicState | null>(latest);
  const [connected, setConnected] = useState(socket.connected);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedName] = useState(() => store.get('name') ?? '');

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (store.get('joined') === '1') {
        socket.emit('player:resume', { playerId }, (res) => {
          if (!res.ok) store.set('joined', null);
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = () => {
      store.set('joined', null);
      setNotice('The host removed you from the game. You can join again.');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('public:state', setPub);
    socket.on('player:kicked', onKicked);
    if (latest) setPub(latest);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('public:state', setPub);
      socket.off('player:kicked', onKicked);
    };
  }, []);

  const join = useCallback((name: string, teamId: TeamId) => {
    return new Promise<string | null>((resolve) => {
      socket.emit('player:join', { playerId, name, teamId }, (res) => {
        if (res.ok) {
          store.set('joined', '1');
          store.set('name', name);
          setNotice(null);
          resolve(null);
        } else resolve(res.error);
      });
    });
  }, []);

  const leave = useCallback(() => {
    store.set('joined', null);
    socket.emit('player:leave');
  }, []);

  const me = pub?.players.find((p) => p.id === playerId) ?? null;
  return { pub, me, connected, notice, savedName, join, leave };
}
