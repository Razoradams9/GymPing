import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Alert, PageHead } from '../components/ui';
import { LinkWhatsApp } from '../components/ConnectWhatsApp';
import { api } from '../api';
import { PRESETS, applyTheme } from '../theme';

const PLACEHOLDERS = ['{first_name}', '{name}', '{gym}', '{when}', '{date}', '{link}'];
const MODES = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
];

function hourLabel(h) {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
}

function preview(template, s) {
  const values = {
    name: 'Sarah Khan',
    first_name: 'Sarah',
    gym: s.name || 'the gym',
    when: 'in 4 days',
    days: '4',
    date: 'Nov 19',
    link: s.payment_url || ''
  };
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
}

// Shrinks any picture to a small square so it loads instantly in the sidebar.
function squareLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const side = Math.min(img.width, img.height);
      canvas
        .getContext('2d')
        .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('That file is not a picture.'));
    img.src = URL.createObjectURL(file);
  });
}

function WhatsAppCard({ status, onUnlink }) {
  return (
    <div className="card card-body">
      <h2>WhatsApp</h2>
      {status?.connected ? (
        <>
          <p className="sub">Reminders are sent from the linked number.</p>
          <div className="connected">
            <div className="stat-icon tone-green"><Icon name="check" size={21} /></div>
            <div>
              <div className="person-name">WhatsApp Connected</div>
              <button className="link-btn" style={{ color: 'var(--muted)', fontWeight: 500 }} onClick={onUnlink}>
                Unlink this number
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="sub">Link your number once.</p>
          <LinkWhatsApp status={status} />
        </>
      )}
    </div>
  );
}

function AccountCard({ gym }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function change(e) {
    e.preventDefault();
    setError('');
    setDone(false);
    try {
      await api('/auth/password', { method: 'POST', body: { current_password: current, new_password: next } });
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card card-body" onSubmit={change}>
      <h2>Account</h2>
      <p className="sub">Signed in as {gym.email}</p>
      <Alert>{error}</Alert>
      <Alert tone="green">{done && 'Password changed.'}</Alert>
      <label className="field">
        <span>Current password</span>
        <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </label>
      <label className="field">
        <span>New password</span>
        <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
      </label>
      <button type="submit" className="btn secondary">Change password</button>
    </form>
  );
}

export default function Settings({ status, gym, setGym }) {
  const [form, setForm] = useState(gym);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const messageRef = useRef(null);

  // Show colour and light/dark choices straight away; go back to the saved look on leaving.
  useEffect(() => {
    applyTheme(form);
  }, [form.theme_color, form.theme_mode]);
  const savedLook = useRef(gym);
  savedLook.current = gym;
  useEffect(() => () => applyTheme(savedLook.current), []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function insert(placeholder) {
    const el = messageRef.current;
    const text = form.message_template || '';
    const at = el ? el.selectionStart : text.length;
    setForm({ ...form, message_template: text.slice(0, at) + placeholder + text.slice(el ? el.selectionEnd : at) });
    if (el) el.focus();
  }

  async function pickLogo(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setForm({ ...form, logo: await squareLogo(file) });
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      const updated = await api('/settings', {
        method: 'POST',
        body: { ...form, send_hour: Number(form.send_hour), renewal_months: Number(form.renewal_months) }
      });
      setForm(updated);
      setGym(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function unlink() {
    if (!window.confirm('Unlink this WhatsApp number? Reminders stop until you scan a new QR code.')) return;
    try {
      await api('/whatsapp/logout', { method: 'POST' });
    } catch (err) {
      setError(err.message);
    }
  }

  const isPreset = PRESETS.some((p) => p.color === (form.theme_color || ''));

  return (
    <div className="page">
      <PageHead title="Settings" subtitle="Your gym, your look, your message" />
      <Alert>{error}</Alert>

      <div className="settings-grid">
        <form onSubmit={save}>
          <div className="card card-body">
            <h2>Gym</h2>
            <p className="sub">Shown in every reminder.</p>
            <label className="field">
              <span>Gym name</span>
              <input type="text" className="input" value={form.name || ''} onChange={set('name')} required maxLength={80} />
            </label>
            <label className="field">
              <span>Payment / renewal link</span>
              <input type="url" className="input" value={form.payment_url || ''} onChange={set('payment_url')} placeholder="https://…" />
              <small>Members tap this link in the reminder to renew.</small>
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>"Renewed" button adds</span>
              <select className="input" style={{ maxWidth: 180 }} value={form.renewal_months} onChange={set('renewal_months')}>
                {[1, 2, 3, 6, 12].map((n) => (
                  <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="card card-body">
            <h2>Look</h2>
            <p className="sub">Make GymPing match your gym.</p>
            <div className="field">
              <span>Logo</span>
              <div className="logo-row">
                {form.logo ? (
                  <img src={form.logo} alt="Your logo" className="logo-preview" />
                ) : (
                  <div className="logo-empty"><Icon name="dumbbell" size={22} /></div>
                )}
                <label className="btn secondary sm">
                  {form.logo ? 'Change' : 'Upload logo'}
                  <input type="file" accept="image/*" onChange={pickLogo} style={{ display: 'none' }} />
                </label>
                {form.logo && (
                  <button type="button" className="link-btn" onClick={() => setForm({ ...form, logo: '' })}>Remove</button>
                )}
              </div>
            </div>
            <div className="field">
              <span>Colour</span>
              <div className="swatches">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.name}
                    className={`swatch ${p.color === (form.theme_color || '') ? 'on' : ''}`}
                    style={{ background: p.color || '#059669' }}
                    onClick={() => setForm({ ...form, theme_color: p.color })}
                    aria-label={p.name}
                    aria-pressed={p.color === (form.theme_color || '')}
                    title={p.name}
                  />
                ))}
                <input
                  type="color"
                  className={`swatch-custom ${isPreset ? '' : 'on'}`}
                  value={form.theme_color || '#059669'}
                  onChange={set('theme_color')}
                  aria-label="Custom colour"
                  title="Custom colour"
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <span>Light or dark</span>
              <div className="segmented">
                {MODES.map((m) => (
                  <button
                    type="button"
                    key={m.value}
                    className={(form.theme_mode || 'system') === m.value ? 'on' : ''}
                    aria-pressed={(form.theme_mode || 'system') === m.value}
                    onClick={() => setForm({ ...form, theme_mode: m.value })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-body">
            <h2>Reminders</h2>
            <p className="sub">
              Each member gets one message a day, starting 4 days before their membership ends and
              stopping as soon as you mark them renewed.
            </p>
            <label className="field">
              <span>Send from</span>
              <select className="input" style={{ maxWidth: 180 }} value={form.send_hour} onChange={set('send_hour')}>
                {Array.from({ length: 21 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
              <small>Indian time. Nothing is sent automatically after 9 PM.</small>
            </label>
            <label className="field">
              <span>Message</span>
              <textarea ref={messageRef} className="input" rows={5} value={form.message_template || ''} onChange={set('message_template')} />
            </label>
            <div className="help" style={{ marginTop: -8 }}>
              Click to insert. These are filled in for each member.{' '}
              <button type="button" className="link-btn" onClick={() => setForm({ ...form, message_template: form.default_template })}>
                Reset to original
              </button>
              <div className="chips">
                {PLACEHOLDERS.map((p) => (
                  <button type="button" className="chip" key={p} onClick={() => insert(p)}>{p}</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ margin: '18px 0 0' }}>
              <span>Preview</span>
              <div className="chat">
                <div className="bubble">{preview(form.message_template || '', form)}</div>
              </div>
            </div>
          </div>

          <div className="save-row" style={{ marginBottom: 20 }}>
            <button type="submit" className="btn">Save settings</button>
            {saved && <span className="saved" role="status"><Icon name="check" size={16} />Saved</span>}
          </div>
        </form>

        <div>
          <WhatsAppCard status={status} onUnlink={unlink} />
          <AccountCard gym={gym} />
        </div>
      </div>
    </div>
  );
}
