import { useCallback, useEffect, useState } from 'react';
import type { HostAction, HostState } from '../../shared/types.ts';
import { socket } from '../socket.ts';

export type Dispatch = (action: HostAction) => void;

/** Connects as the host and keeps the latest game state from the server. */
export function useHost() {
  const [state, setState] = useState<HostState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [denied, setDenied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const hello = () => {
      setConnected(true);
      socket.emit('host:hello', (res) => setDenied(res.ok ? null : res.error));
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', hello);
    socket.on('disconnect', onDisconnect);
    socket.on('host:state', setState);
    if (socket.connected) hello();
    return () => {
      socket.off('connect', hello);
      socket.off('disconnect', onDisconnect);
      socket.off('host:state', setState);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const dispatch = useCallback<Dispatch>((action) => {
    socket.emit('host:action', action, (res) => {
      if (!res.ok) setToast(res.error);
    });
  }, []);

  return { state, connected, denied, toast, dispatch };
}
