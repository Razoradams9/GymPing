import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import Icon from './components/Icon';
import ConnectScreen from './components/ConnectWhatsApp';
import Auth from './pages/Auth';
import Landing from './pages/Landing';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Settings from './pages/Settings';
import { Privacy, Terms } from './pages/Legal';
import { api, setLoggedOutHandler } from './api';
import { applyTheme } from './theme';

function Brand({ gym }) {
  return (
    <div className="brand">
      {gym?.logo ? (
        <img src={gym.logo} alt="" className="brand-logo" />
      ) : (
        <div className="brand-mark"><Icon name="dumbbell" size={19} /></div>
      )}
      <span className="brand-text">
        <span className="brand-name">{gym?.name || 'GymPing'}</span>
        {gym && <span className="brand-by">GymPing</span>}
      </span>
    </div>
  );
}

function Sidebar({ gym, status, onLogout }) {
  const connected = !!status?.connected;
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <Brand gym={gym.is_admin ? null : gym} />
        <nav className="nav">
          {gym.is_admin ? (
            <NavLink to="/" end><Icon name="users" /><span>Gyms</span></NavLink>
          ) : (
            <>
              <NavLink to="/" end><Icon name="dashboard" /><span>Dashboard</span></NavLink>
              <NavLink to="/members"><Icon name="users" /><span>Members</span></NavLink>
              <NavLink to="/settings"><Icon name="settings" /><span>Settings</span></NavLink>
            </>
          )}
        </nav>
        <div className="side-foot">
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
          <button type="button" className="side-btn" onClick={onLogout}>
            <Icon name="power" size={16} />
            <span className="long">Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

// Shown to an owner whose account is waiting for approval or has been suspended.
function AccountNotice({ gym, onLogout, onRefresh }) {
  const pending = gym.status === 'pending';
  return (
    <div className="login">
      <div className="card card-body notice">
        <div className={`stat-icon tone-${pending ? 'amber' : 'red'}`}>
          <Icon name={pending ? 'clock' : 'alert'} size={21} />
        </div>
        <h1>{pending ? 'Waiting for approval' : 'Account suspended'}</h1>
        <p>
          {pending
            ? `Thanks for signing up, ${gym.name}. Your account will be ready as soon as it is approved.`
            : 'This account has been suspended. Contact us if you think this is a mistake.'}
        </p>
        <div className="modal-foot" style={{ justifyContent: 'center' }}>
          <button className="btn secondary" onClick={onLogout}>Log out</button>
          {pending && <button className="btn" onClick={onRefresh}>Check again</button>}
        </div>
      </div>
    </div>
  );
}

function GymApp({ gym, setGym, onLogout }) {
  const [status, setStatus] = useState(null);
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem('gymping-skip-connect') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const load = () => api('/status').then(setStatus).catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  function skipConnect() {
    try {
      sessionStorage.setItem('gymping-skip-connect', '1');
    } catch {
      /* private window: only skipped until the page reloads */
    }
    setSkipped(true);
  }

  if (status && !status.connected && !skipped) return <ConnectScreen status={status} onSkip={skipConnect} />;

  return (
    <div className="shell">
      <Sidebar gym={gym} status={status} onLogout={onLogout} />
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
          <Route path="/members" element={<Members status={status} />} />
          <Route path="/settings" element={<Settings status={status} gym={gym} setGym={setGym} />} />
          <Route path="*" element={<Dashboard status={status} gym={gym} />} />
        </Routes>
      </main>
    </div>
  );
}

function Main() {
  const [gym, setGym] = useState(undefined); // undefined = still checking, null = logged out

  const refresh = useCallback(
    () =>
      api('/auth/me')
        .then(setGym)
        .catch(() => setGym(null)),
    []
  );

  useEffect(() => {
    setLoggedOutHandler(() => setGym(null));
    refresh();
  }, [refresh]);

  useEffect(() => {
    applyTheme(gym && !gym.is_admin ? gym : null);
  }, [gym]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setGym(null);
  }

  if (gym === undefined) return null;
  if (gym === null) {
    return (
      <Routes>
        <Route path="/login" element={<Auth key="login" onDone={setGym} />} />
        <Route path="/signup" element={<Auth key="signup" onDone={setGym} initialMode="signup" />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    );
  }
  if (gym.is_admin) {
    return (
      <div className="shell">
        <Sidebar gym={gym} status={null} onLogout={logout} />
        <main className="main"><Admin /></main>
      </div>
    );
  }
  if (gym.status !== 'active') return <AccountNotice gym={gym} onLogout={logout} onRefresh={refresh} />;
  return <GymApp gym={gym} setGym={setGym} onLogout={logout} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Main />} />
      </Routes>
    </BrowserRouter>
  );
}
