import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Settings from './pages/Settings';
import { api, setPassword, setUnauthorizedHandler } from './api';
import { button, card, input } from './ui';

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [wrong, setWrong] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setPassword(pw);
    try {
      await api('/status');
      onDone();
    } catch {
      setWrong(true);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...card, maxWidth: '360px', margin: '4rem auto', padding: '1.5rem' }}>
      <h2 style={{ marginTop: 0, color: '#1a1a2e' }}>🏋️ GymPing</h2>
      <label style={{ fontWeight: 600 }}>
        Password
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={input} autoFocus />
      </label>
      {wrong && <p style={{ color: '#c62828', marginTop: 0 }}>Wrong password.</p>}
      <button type="submit" style={button()}>Open</button>
    </form>
  );
}

export default function App() {
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setUnauthorizedHandler(() => setLocked(true));
    if (locked) return undefined;
    const load = () => api('/status').then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [locked]);

  if (locked) return <Login onDone={() => setLocked(false)} />;

  return (
    <BrowserRouter>
      <Navbar status={status} />
      {status && !status.connected && (
        <div style={{ background: '#c62828', color: '#fff', padding: '0.8rem 2rem', fontWeight: 600 }}>
          ⚠️ WhatsApp is not connected, so reminders are paused.{' '}
          <Link to="/settings" style={{ color: '#fff' }}>Open Settings to connect</Link>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Dashboard status={status} />} />
        <Route path="/members" element={<Members status={status} />} />
        <Route path="/settings" element={<Settings status={status} />} />
      </Routes>
    </BrowserRouter>
  );
}
