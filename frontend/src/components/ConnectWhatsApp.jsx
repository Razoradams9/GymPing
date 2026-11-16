import { useState } from 'react';
import Icon from './Icon';
import { Alert } from './ui';
import { api } from '../api';

// The QR code (or a spinner while WhatsApp prepares one).
function QrCode({ status }) {
  if (status?.qr) return <img src={status.qr} alt="WhatsApp QR code" className="qr" />;
  return (
    <div className="qr qr-wait">
      <div className="spinner" />
      <span>Getting your code…</span>
    </div>
  );
}

const OpenLinkedDevices = () => (
  <>
    <li>Open <strong>WhatsApp</strong> on your phone</li>
    <li>Tap <strong>Settings</strong> (or ⋮ on Android), then <strong>Linked Devices</strong></li>
  </>
);

// Linking by typing a code, for when you can't point a camera at the screen
// (for example GymPing is open on the same phone).
function PhoneLink({ status }) {
  const [phone, setPhone] = useState('');
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const code = status?.pairing_code;

  async function getCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/whatsapp/pairing-code', { method: 'POST', body: { phone } });
      setAsked(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <div>
        <div className="pair-code" aria-label={`Your code is ${code.split('').join(' ')}`}>
          <span>{code.slice(0, 4)}</span>
          <span>{code.slice(4)}</span>
        </div>
        <ol className="steps">
          <OpenLinkedDevices />
          <li>Tap <strong>Link a Device</strong>, then <strong>Link with phone number instead</strong></li>
          <li>Type this code</li>
        </ol>
      </div>
    );
  }

  return (
    <form onSubmit={getCode}>
      <Alert>{error}</Alert>
      {asked && !error && <Alert tone="amber">That code expired before it was used. Get a new one.</Alert>}
      <label className="field">
        <span>Your WhatsApp number</span>
        <input
          type="tel"
          className="input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          required
          autoComplete="tel"
        />
        <small>The number reminders will be sent from.</small>
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Getting code…' : 'Get code'}
      </button>
    </form>
  );
}

// Both ways of linking a number, with a switch between them.
export function LinkWhatsApp({ status, wide = false }) {
  const [byPhone, setByPhone] = useState(false);
  const toggle = (
    <button type="button" className="link-btn link-switch" onClick={() => setByPhone(!byPhone)}>
      {byPhone ? 'Scan a QR code instead' : 'Link with phone number instead'}
    </button>
  );

  if (byPhone) {
    return (
      <div>
        <PhoneLink status={status} />
        {toggle}
      </div>
    );
  }

  return (
    <div className={wide ? 'link-wide' : ''}>
      <div>
        <ol className="steps">
          <OpenLinkedDevices />
          <li>Tap <strong>Link a Device</strong> and point your phone at this code</li>
        </ol>
        {!status?.qr && <p className="help">The code can take a minute or two to appear the first time.</p>}
        {wide && toggle}
      </div>
      <QrCode status={status} />
      {!wide && toggle}
    </div>
  );
}

// Shown before anything else until WhatsApp is linked; it moves on by itself once linking succeeds.
export default function ConnectScreen({ status, onSkip }) {
  return (
    <div className="connect">
      <div className="card connect-card">
        <div className="brand">
          <div className="brand-mark"><Icon name="dumbbell" size={19} /></div>
          <span>GymPing</span>
        </div>
        <h1>Connect your WhatsApp</h1>
        <p className="sub">
          Reminders are sent from your gym's WhatsApp number. Link it once and you're set.
        </p>
        <LinkWhatsApp status={status} wide />
        <button type="button" className="link-btn connect-skip" onClick={onSkip}>
          Skip for now, I'll connect later
        </button>
      </div>
    </div>
  );
}
