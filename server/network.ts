import os from 'node:os';

/**
 * IPv4 addresses phones on the same network can use to reach this laptop,
 * best guess first. Virtual adapters (WSL, Hyper-V, VirtualBox, VPNs...) are
 * pushed to the end because phones usually can't reach them.
 */
export function lanAddresses(): string[] {
  const found: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const info of list ?? []) {
      const isV4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (!isV4 || info.internal || info.address.startsWith('169.254.')) continue;
      const n = name.toLowerCase();
      let score = 0;
      if (/wi-?fi|wlan|wireless|airport|^en\d|^eth|ethernet/.test(n)) score += 10;
      if (/vethernet|virtual|vmware|vbox|hyper-v|wsl|docker|^br-|^veth|tailscale|zerotier|vpn|^tun|^tap|^utun|bluetooth|loopback|npcap/.test(n)) score -= 20;
      if (info.address.startsWith('192.168.')) score += 5;
      else if (info.address.startsWith('10.')) score += 3;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(info.address)) score += 1;
      found.push({ address: info.address, score });
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.address);
}

/** All addresses that belong to this machine, used to recognise the host screen. */
export function ownAddresses(): Set<string> {
  const set = new Set(['127.0.0.1', '::1']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list ?? []) set.add(info.address);
  }
  return set;
}

export function normalizeAddress(address: string | undefined): string {
  return (address ?? '').replace(/^::ffff:/, '');
}
