import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import Icon from './components/Icon';
import ConnectScreen from './components/ConnectWhatsApp';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Settings from './pages/Settings';
import { api, setPassword, setUnauthorizedHandler } from './api';

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Icon name="dumbbell" size={19} /></div>
      <span>GymPing</span>
    </div>
  );
}

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
    <div className="login">
      <form onSubmit={submit} className="card card-body">
        <Brand />
        <label className="field">
          <span>Password</span>
          <input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          {wrong && <small style={{ color: 'var(--danger)' }}>Wrong password.</small>}
        </label>
        <button type="submit" className="btn" style={{ width: '100%' }}>Open GymPing</button>
      </form>
    </div>
  );
}

function Sidebar({ status }) {
  const connected = !!status?.connected;
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
      <Brand />
      <nav className="nav">
        <NavLink to="/" end><Icon name="dashboard" /><span>Dashboard</span></NavLink>
        <NavLink to="/members"><Icon name="users" /><span>Members</span></NavLink>
        <NavLink to="/settings"><Icon name="settings" /><span>Settings</span></NavLink>
      </nav>
      {status && (
        <Link to="/settings" className={`wa-pill ${connected ? '' : 'off'}`}>
          <span className="dot" />
          {connected ? (
            <span>WhatsApp<span className="long"> connected</span></span>
          ) : (
            <span>Connect WhatsApp</span>
          )}
        </Link>
      )}
      </div>
    </aside>
  );
}

export default function App() {
  const [locked, setLocked] = useState(false);
  const [status, setStatus] = useState(null);
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem('gymping-skip-connect') === '1';
    } catch {
      return false;
    }
  });

  function skipConnect() {
    try {
      sessionStorage.setItem('gymping-skip-connect', '1');
    } catch {
      /* private window: only skipped until the page reloads */
    }
    setSkipped(true);
  }

  useEffect(() => {
    setUnauthorizedHandler(() => setLocked(true));
    if (locked) return undefined;
    const load = () => api('/status').then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [locked]);

  if (locked) return <Login onDone={() => setLocked(false)} />;
  if (status && !status.connected && !skipped) return <ConnectScreen status={status} onSkip={skipConnect} />;

  return (
    <BrowserRouter>
      <div className="shell">
        <Sidebar status={status} />
        <main className="main">
          {status && !status.connected && (
            <div className="alert banner" role="alert">
              <Icon name="alert" />
              <div>
                WhatsApp is not connected, so reminders are paused.{' '}
                <Link to="/settings">Connect it in Settings</Link>
              </div>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard status={status} />} />
            <Route path="/members" element={<Members status={status} />} />
            <Route path="/settings" element={<Settings status={status} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
