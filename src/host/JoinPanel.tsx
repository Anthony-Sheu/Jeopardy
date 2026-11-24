import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

/** QR code + address players use to join from their phones. */
export function JoinPanel({ urls, size = 240 }: { urls: string[]; size?: number }) {
  const [index, setIndex] = useState(0);
  const url = urls[Math.min(index, urls.length - 1)] ?? '';
  const display = url.replace(/^https?:\/\//, '');

  return (
    <div className="join-panel">
      <div className="qr-frame">
        <QRCodeSVG value={url} size={size} marginSize={0} bgColor="#ffffff" fgColor="#030766" level="M" />
      </div>
      <div className="join-text">
        <p className="join-label">Scan, or open on your phone:</p>
        <p className="join-url">{display}</p>
        <ol className="join-steps">
          <li>Connect to the same Wi-Fi as this laptop</li>
          <li>Scan the code or type the address</li>
          <li>Enter your name and pick a team</li>
        </ol>
        {urls.length > 1 && (
          <button className="link-btn" onClick={() => setIndex((i) => (i + 1) % urls.length)}>
            Phones can't connect? Try another address ({index + 1}/{urls.length})
          </button>
        )}
      </div>
    </div>
  );
}
