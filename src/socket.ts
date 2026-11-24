import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.ts';

/** One shared connection per tab. WebSocket first for the lowest buzzer latency. */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  transports: ['websocket', 'polling'],
  tryAllTransports: true,
});

// Answer the server's latency probes immediately.
socket.on('rtt', (ack) => ack());
