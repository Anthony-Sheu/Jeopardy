// Game server: serves the React app and relays everything over Socket.IO.
// Run `npm start`, then open the host screen on this laptop and have players
// open the join link (or scan the QR code) on their phones.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, HostAction, ServerToClientEvents } from '../shared/types.ts';
import { DEFAULT_RTT_MS, Game, GameError, type SavedGame } from './game.ts';
import { lanAddresses, normalizeAddress, ownAddresses } from './network.ts';

const args = new Set(process.argv.slice(2));
const DEV = args.has('--dev');
const PORT = Number(process.env.PORT) || 3000;
/** Port phones should use: in dev mode they go through Vite. */
const PUBLIC_PORT = DEV ? 5173 : PORT;
const ALLOW_REMOTE_HOST = args.has('--allow-remote-host') || process.env.ALLOW_REMOTE_HOST === '1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const dataDir = path.join(root, 'data');
const saveFile = path.join(dataDir, 'game.json');

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  pingInterval: 5000,
  pingTimeout: 8000,
});

// ------------------------------------------------------------------ game + persistence

const game = new Game(() => broadcast());

if (!args.has('--fresh') && fs.existsSync(saveFile)) {
  try {
    game.load(JSON.parse(fs.readFileSync(saveFile, 'utf8')) as Partial<SavedGame>);
    console.log('  Restored the previous game from data/game.json (start with --fresh to ignore it).');
  } catch (err) {
    console.warn('  Could not read data/game.json, starting a fresh game.', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveNow(): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${saveFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(game.toSaved(), null, 2));
    fs.renameSync(tmp, saveFile);
  } catch (err) {
    console.warn('Could not save the game:', err);
  }
}
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 400);
}

const joinUrls = () => {
  const urls = lanAddresses().map((ip) => `http://${ip}:${PUBLIC_PORT}`);
  return urls.length ? urls : [`http://localhost:${PUBLIC_PORT}`];
};

function broadcast(): void {
  io.to('host').emit('host:state', game.hostState(joinUrls()));
  io.to('players').emit('public:state', game.publicState());
  scheduleSave();
}

// ------------------------------------------------------------------ latency tracking

/** Recent round-trip times per socket, used to sanity-check reported reaction times. */
const rtts = new Map<string, number[]>();

function probeRtt(socket: GameSocket): void {
  const start = performance.now();
  socket.timeout(3000).emit('rtt', (err: Error | null) => {
    if (err) return;
    const samples = rtts.get(socket.id) ?? [];
    samples.push(performance.now() - start);
    if (samples.length > 6) samples.shift();
    rtts.set(socket.id, samples);
  });
}

function rttFor(socketId: string): number {
  const samples = rtts.get(socketId);
  return samples?.length ? Math.max(...samples) : DEFAULT_RTT_MS;
}

setInterval(() => {
  for (const [id, socket] of io.of('/').sockets) {
    if (game.playerIdForSocket(id)) probeRtt(socket);
  }
}, 2000).unref();

// ------------------------------------------------------------------ sockets

const own = ownAddresses();
const isHostAllowed = (address: string) => ALLOW_REMOTE_HOST || own.has(address) || ownAddresses().has(address);

function reply<T>(ack: unknown, value: T): void {
  if (typeof ack === 'function') ack(value);
}

function errorMessage(err: unknown): string {
  if (err instanceof GameError) return err.message;
  console.error(err);
  return 'Something went wrong on the server.';
}

io.on('connection', (socket: GameSocket) => {
  const address = normalizeAddress(socket.handshake.address);
  let isHost = false;
  socket.join('players');
  socket.emit('public:state', game.publicState());

  socket.on('host:hello', (ack) => {
    if (!isHostAllowed(address)) {
      reply(ack, {
        ok: false,
        error: 'The host screen only works on the computer running the game. Players: open the join link instead.',
      });
      return;
    }
    isHost = true;
    socket.leave('players');
    socket.join('host');
    reply(ack, { ok: true });
    socket.emit('host:state', game.hostState(joinUrls()));
  });

  socket.on('host:action', (action: HostAction, ack) => {
    if (!isHost) return reply(ack, { ok: false, error: 'Not the host.' });
    if (!action || typeof action !== 'object') return reply(ack, { ok: false, error: 'Bad request.' });
    const kicked = action.type === 'kickPlayer' ? game.socketsForPlayer(action.playerId) : [];
    try {
      game.dispatch(action);
      reply(ack, { ok: true });
    } catch (err) {
      reply(ack, { ok: false, error: errorMessage(err) });
    }
    for (const id of kicked) io.to(id).emit('player:kicked');
    broadcast();
  });

  socket.on('player:join', (data, ack) => {
    try {
      const player = game.joinPlayer(socket.id, data ?? {});
      reply(ack, { ok: true, player });
      probeRtt(socket);
      broadcast();
    } catch (err) {
      reply(ack, { ok: false, error: errorMessage(err) });
    }
  });

  socket.on('player:resume', (data, ack) => {
    try {
      const player = game.resumePlayer(socket.id, data?.playerId);
      reply(ack, { ok: true, player });
      probeRtt(socket);
      broadcast();
    } catch (err) {
      reply(ack, { ok: false, error: errorMessage(err) });
    }
  });

  socket.on('player:leave', () => {
    game.leave(socket.id);
    broadcast();
  });

  socket.on('player:buzz', (data) => {
    if (!data || typeof data !== 'object') return;
    // Accepted presses are announced after the short settle window (see Game.buzz).
    game.buzz(socket.id, Number(data.round), Number(data.reactionMs), rttFor(socket.id));
  });

  socket.on('disconnect', () => {
    rtts.delete(socket.id);
    if (game.disconnect(socket.id)) broadcast();
  });
});

// ------------------------------------------------------------------ http

if (!DEV) {
  const indexHtml = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error('\n  The app has not been built yet. Run `npm start` (or `npm run build` first).\n');
    process.exit(1);
  }
  app.use(express.static(distDir));
  app.use((_req, res) => res.sendFile(indexHtml));
}

function openBrowser(url: string): void {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs as string[], { detached: true, stdio: 'ignore' })
      .on('error', () => {})
      .unref();
  } catch {
    /* opening a browser is a convenience only */
  }
}

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Close the other game window, or run with a different port:`);
    console.error(process.platform === 'win32' ? '    set PORT=3001 && npm start\n' : '    PORT=3001 npm start\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

httpServer.listen(PORT, () => {
  const [primary, ...others] = joinUrls();
  const hostUrl = `http://localhost:${PUBLIC_PORT}/host`;
  console.log('');
  console.log('  ┌────────────────────────────────────────────┐');
  console.log('  │                 JEOPARDY!                  │');
  console.log('  └────────────────────────────────────────────┘');
  console.log(`  Host screen (this laptop):  ${hostUrl}`);
  console.log(`  Players join on phones at:  ${primary}`);
  if (others.length) console.log(`  Other addresses to try:     ${others.join('  ')}`);
  console.log('');
  console.log('  Phones must be on the same Wi-Fi. If they can\'t connect, allow Node.js');
  console.log('  through the firewall on private networks (see README > Troubleshooting).');
  console.log('  Press Ctrl+C to stop.\n');
  if (!DEV && !args.has('--no-open')) openBrowser(hostUrl);
});

function shutdown(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
