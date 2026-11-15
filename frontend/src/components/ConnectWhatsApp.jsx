import Icon from './Icon';

// The QR code (or a spinner while WhatsApp prepares one).
export function QrCode({ status }) {
  if (status?.qr) return <img src={status.qr} alt="WhatsApp QR code" className="qr" />;
  return (
    <div className="qr qr-wait">
      <div className="spinner" />
      <span>Getting your code…</span>
    </div>
  );
}

export function LinkSteps() {
  return (
    <ol className="steps">
      <li>Open <strong>WhatsApp</strong> on your phone</li>
      <li>Tap <strong>Settings</strong> (or ⋮ on Android), then <strong>Linked Devices</strong></li>
      <li>Tap <strong>Link a Device</strong> and point your phone at this code</li>
    </ol>
  );
}

// Shown before anything else until WhatsApp is linked; it moves on by itself once the scan succeeds.
export default function ConnectScreen({ status, onSkip }) {
  return (
    <div className="connect">
      <div className="card connect-card">
        <div className="brand">
          <div className="brand-mark"><Icon name="dumbbell" size={19} /></div>
          <span>GymPing</span>
        </div>
        <div className="connect-body">
          <div>
            <h1>Connect your WhatsApp</h1>
            <p className="sub">
              Reminders are sent from your gym's WhatsApp number. Scan the code once and you're set.
            </p>
            <LinkSteps />
            {!status.qr && (
              <p className="help">The code can take a minute or two to appear the first time.</p>
            )}
          </div>
          <QrCode status={status} />
        </div>
        <button type="button" className="link-btn connect-skip" onClick={onSkip}>
          Skip for now, I'll connect later
        </button>
      </div>
    </div>
  );
}
