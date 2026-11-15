import { useEffect, useState } from 'react';
import { api } from '../api';
import { button, card, colors, errorBox, hint, input, label, page } from '../ui';

const box = { ...card, padding: '1.5rem 2rem' };

function hourLabel(h) {
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
}

function preview(template, s) {
  const values = {
    name: 'Sarah Khan',
    first_name: 'Sarah',
    gym: s.gym_name || 'the gym',
    when: 'in 4 days',
    days: '4',
    date: 'Nov 19',
    link: s.payment_url || ''
  };
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
}

export default function Settings({ status }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [off, setOff] = useState(false);

  useEffect(() => {
    api('/settings').then(setForm).catch((err) => setError(err.message));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      setForm(
        await api('/settings', {
          method: 'POST',
          body: { ...form, send_hour: Number(form.send_hour), renewal_months: Number(form.renewal_months) }
        })
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function turnOff() {
    if (!window.confirm('Turn GymPing off? No reminders are sent until you start it again.')) return;
    try {
      await api('/shutdown', { method: 'POST' });
      setOff(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function disconnect() {
    if (!window.confirm('Unlink this WhatsApp number? Reminders stop until you scan a new QR code.')) return;
    try {
      await api('/whatsapp/logout', { method: 'POST' });
    } catch (err) {
      setError(err.message);
    }
  }

  if (off) {
    return (
      <div style={{ ...page, maxWidth: '680px' }}>
        <div style={box}>
          <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>GymPing is turned off</h3>
          <p style={{ color: '#555', marginBottom: 0 }}>
            You can close this tab. Use the GymPing icon to start it again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...page, maxWidth: '680px' }}>
      <h2 style={{ color: '#1a1a2e', marginTop: 0 }}>Settings</h2>
      {error && <div style={errorBox}>{error}</div>}

      <div style={box}>
        <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>WhatsApp Connection</h3>
        {status?.connected ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <span style={{ background: '#e8f5e9', color: colors.green, borderRadius: '6px', padding: '0.6rem 1.2rem', fontWeight: 600 }}>
              ✅ WhatsApp Connected
            </span>
            <button onClick={disconnect} style={button(colors.grey, true)}>Unlink this number</button>
          </div>
        ) : status?.qr ? (
          <div>
            <p style={{ color: '#555', marginTop: 0 }}>
              On your phone: WhatsApp → Settings → Linked Devices → Link a Device, then scan this code.
            </p>
            <img
              src={status.qr}
              alt="WhatsApp QR code"
              style={{ display: 'block', width: '240px', height: '240px', borderRadius: '8px', border: '1px solid #eee' }}
            />
            <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: 0 }}>Waiting for scan…</p>
          </div>
        ) : (
          <p style={{ color: '#888', margin: 0 }}>Connecting to WhatsApp… a QR code will appear shortly.</p>
        )}
      </div>

      {form && (
        <form onSubmit={save}>
          <div style={box}>
            <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>Gym</h3>
            <label style={label}>
              Gym Name
              <input type="text" value={form.gym_name || ''} onChange={set('gym_name')} style={input} />
            </label>
            <label style={label}>
              Payment / Renewal Link
              <input type="url" value={form.payment_url || ''} onChange={set('payment_url')} placeholder="https://…" style={input} />
            </label>
            <label style={label}>
              "Renewed" button adds
              <select value={form.renewal_months} onChange={set('renewal_months')} style={{ ...input, maxWidth: '160px' }}>
                {[1, 2, 3, 6, 12].map((n) => (
                  <option key={n} value={n}>{n} month{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={box}>
            <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>Reminders</h3>
            <p style={{ color: '#555', marginTop: 0 }}>
              Each member gets one message a day, starting 4 days before their membership ends and
              stopping as soon as you mark them renewed.
            </p>
            <label style={label}>
              Send from
              <select value={form.send_hour} onChange={set('send_hour')} style={{ ...input, maxWidth: '160px' }}>
                {Array.from({ length: 21 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)}</option>
                ))}
              </select>
            </label>
            <p style={hint}>Nothing is sent automatically after 9 PM.</p>
            <label style={label}>
              Message
              <textarea
                rows={4}
                value={form.message_template || ''}
                onChange={set('message_template')}
                style={{ ...input, resize: 'vertical' }}
              />
            </label>
            <p style={hint}>
              These are filled in for each member: {'{first_name}'} {'{name}'} {'{gym}'} {'{when}'} {'{date}'} {'{link}'}{' '}
              <button
                type="button"
                onClick={() => setForm({ ...form, message_template: form.default_template })}
                style={{ background: 'none', border: 'none', color: colors.blue, cursor: 'pointer', padding: 0, fontSize: 'inherit' }}
              >
                Reset to original
              </button>
            </p>
            <div style={{ fontWeight: 600, color: '#333', marginBottom: '0.3rem' }}>Preview</div>
            <div style={{ background: '#dcf8c6', borderRadius: '8px', padding: '0.7rem 1rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {preview(form.message_template || '', form)}
            </div>
          </div>

          <button type="submit" style={button()}>Save Settings</button>
          {saved && <span style={{ marginLeft: '1rem', color: colors.green, fontWeight: 600 }}>✅ Saved!</span>}
        </form>
      )}

      <div style={{ ...box, marginTop: '1.5rem' }}>
        <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>Turn Off</h3>
        <p style={{ color: '#555', marginTop: 0 }}>
          GymPing keeps running in the background, even with this tab closed, so reminders go out on time.
        </p>
        <button type="button" onClick={turnOff} style={button(colors.grey)}>Turn GymPing off</button>
      </div>
    </div>
  );
}
