import '@fontsource-variable/oswald';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HostApp } from './host/HostApp.tsx';
import { PlayerApp } from './player/PlayerApp.tsx';

// On the laptop itself, the bare address goes straight to the host screen.
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (isLocal && (location.pathname === '/' || location.pathname === '')) {
  history.replaceState(null, '', '/host');
}
const isHost = location.pathname.startsWith('/host');
document.body.classList.add(isHost ? 'is-host' : 'is-player');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isHost ? <HostApp /> : <PlayerApp />}</StrictMode>,
);
