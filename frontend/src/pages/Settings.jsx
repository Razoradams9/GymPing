import { useEffect, useState, useRef } from 'react';

const API = 'http://localhost:3001';

export default function Settings() {
  const [status, setStatus] = useState({ connected: false, qr: null });
  const [gymName, setGymName] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const pollingRef = useRef(null);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/api/status`);
      const data = await res.json();
      setStatus(data);
      if (data.connected) {
        clearInterval(pollingRef.current);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }

  useEffect(() => {
    fetchStatus();
    pollingRef.current = setInterval(fetchStatus, 3000);
    return () => clearInterval(pollingRef.current);
  }, []);

  useEffect(() => {
    if (status.connected) {
      clearInterval(pollingRef.current);
    }
  }, [status.connected]);

  useEffect(() => {
    fetch(`${API}/api/settings`)
      .then((r) => r.json())
      .then((data) => {
        setGymName(data.gym_name || '');
        setPaymentUrl(data.payment_url || '');
      })
      .catch(console.error);
  }, []);

  async function handleSaveSettings(e) {
    e.preventDefault();
    try {
      await fetch(`${API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym_name: gymName, payment_url: paymentUrl })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  const cardStyle = {
    background: '#fff',
    borderRadius: '8px',
    padding: '1.5rem 2rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    marginBottom: '1.5rem'
  };

  const inputStyle = {
    display: 'block',
    width: '100%',
    padding: '0.6rem 0.8rem',
    marginTop: '0.3rem',
    marginBottom: '1rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box'
  };

  const labelStyle = { fontWeight: '600', color: '#333' };

  return (
    <div style={{ padding: '2rem', background: '#f5f5f5', minHeight: '100vh', maxWidth: '640px', margin: '0 auto' }}>
      <h2 style={{ color: '#1a1a2e', marginTop: 0 }}>Settings</h2>

      {/* WhatsApp Connection Card */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>WhatsApp Connection</h3>
        {status.connected ? (
          <div
            style={{
              display: 'inline-block',
              background: '#e8f5e9',
              color: '#2e7d32',
              borderRadius: '6px',
              padding: '0.6rem 1.2rem',
              fontWeight: '600',
              fontSize: '1rem'
            }}
          >
            ✅ WhatsApp Connected
          </div>
        ) : status.qr ? (
          <div>
            <p style={{ color: '#555', marginTop: 0 }}>
              Scan this QR code with WhatsApp on your phone
            </p>
            <img
              src={status.qr}
              alt="WhatsApp QR Code"
              style={{ display: 'block', width: '240px', height: '240px', borderRadius: '8px', border: '1px solid #eee' }}
            />
            <p style={{ color: '#888', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Waiting for scan… checking every 3 seconds.
            </p>
          </div>
        ) : (
          <p style={{ color: '#888' }}>Connecting to WhatsApp… QR code will appear shortly.</p>
        )}
      </div>

      {/* Gym Settings Card */}
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>Gym Settings</h3>
        <form onSubmit={handleSaveSettings}>
          <label style={labelStyle}>
            Gym Name
            <input
              type="text"
              value={gymName}
              onChange={(e) => setGymName(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Payment / Renewal URL
            <input
              type="text"
              value={paymentUrl}
              onChange={(e) => setPaymentUrl(e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            style={{
              background: '#1a1a2e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.6rem 1.4rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Save Settings
          </button>
          {saved && (
            <span style={{ marginLeft: '1rem', color: '#2e7d32', fontWeight: '600' }}>
              ✅ Saved!
            </span>
          )}
        </form>
      </div>
    </div>
  );
}
