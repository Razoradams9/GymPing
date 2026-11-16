import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Alert } from '../components/ui';
import { api } from '../api';

export default function Auth({ onDone, initialMode = 'login' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // login | signup
  const [gymName, setGymName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const gym = await api(signup ? '/auth/signup' : '/auth/login', {
        method: 'POST',
        body: signup ? { gym_name: gymName, email, password, agree } : { email, password }
      });
      navigate('/', { replace: true });
      onDone(gym);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div>
        <Link to="/" className="login-back">← Back to GymPing</Link>
        <form onSubmit={submit} className="card card-body">
          <div className="brand">
            <div className="brand-mark"><Icon name="dumbbell" size={19} /></div>
            <span>GymPing</span>
          </div>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!signup} className={signup ? '' : 'on'} onClick={() => { setMode('login'); setError(''); }}>
              Log in
            </button>
            <button type="button" role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); }}>
              Create account
            </button>
          </div>
          <Alert>{error}</Alert>
          {signup && (
            <label className="field">
              <span>Gym name</span>
              <input type="text" className="input" value={gymName} onChange={(e) => setGymName(e.target.value)} required maxLength={80} />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={signup ? 8 : undefined}
              autoComplete={signup ? 'new-password' : 'current-password'}
            />
            {signup && <small>At least 8 characters.</small>}
          </label>
          {signup && (
            <label className="check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
              <span>
                I agree to the <Link to="/terms" target="_blank">Terms of Use</Link> and{' '}
                <Link to="/privacy" target="_blank">Privacy Policy</Link>
              </span>
            </label>
          )}
          <button type="submit" className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
          </button>
          {!signup && <p className="help" style={{ textAlign: 'center' }}>Forgot your password? Contact us and we'll reset it.</p>}
        </form>
        <p className="login-foot">
          <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
