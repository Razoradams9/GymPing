import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Alert, PageHead } from '../components/ui';
import { api } from '../api';

const PLACEHOLDERS = ['{first_name}', '{name}', '{gym}', '{when}', '{date}', '{link}'];

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
      ) : status?.qr ? (
        <>
          <p className="sub">Scan this code once to link your number.</p>
          <img src={status.qr} alt="WhatsApp QR code" className="qr" />
          <ol className="steps">
            <li>Open WhatsApp on your phone</li>
            <li>Settings → Linked Devices → Link a Device</li>
            <li>Point your phone at this code</li>
          </ol>
        </>
      ) : (
        <>
          <p className="sub">Getting a QR code from WhatsApp. This can take a minute or two.</p>
          <div className="connected">
            <div className="spinner" />
            <span>Connecting…</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function Settings({ status }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [off, setOff] = useState(false);
  const messageRef = useRef(null);

  useEffect(() => {
    api('/settings').then(setForm).catch((err) => setError(err.message));
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function insert(placeholder) {
    const el = messageRef.current;
    const text = form.message_template || '';
    const at = el ? el.selectionStart : text.length;
    setForm({ ...form, message_template: text.slice(0, at) + placeholder + text.slice(el ? el.selectionEnd : at) });
    if (el) el.focus();
  }

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

  async function unlink() {
    if (!window.confirm('Unlink this WhatsApp number? Reminders stop until you scan a new QR code.')) return;
    try {
      await api('/whatsapp/logout', { method: 'POST' });
    } catch (err) {
      setError(err.message);
    }
  }

  if (off) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty">
            <div className="stat-icon tone-neutral"><Icon name="power" size={20} /></div>
            <strong>GymPing is turned off</strong>
            You can close this tab. Use the GymPing icon to start it again.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Settings" subtitle="Your gym, your message, your WhatsApp link" />
      <Alert>{error}</Alert>

      <div className="settings-grid">
        <div>
          {form && (
            <form onSubmit={save}>
              <div className="card card-body">
                <h2>Gym</h2>
                <p className="sub">Shown in every reminder.</p>
                <label className="field">
                  <span>Gym name</span>
                  <input type="text" className="input" value={form.gym_name || ''} onChange={set('gym_name')} />
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
                <h2>Reminders</h2>
                <p className="sub">
                  Each member gets one message a day, starting 4 days before their membership ends
                  and stopping as soon as you mark them renewed.
                </p>
                <label className="field">
                  <span>Send from</span>
                  <select className="input" style={{ maxWidth: 180 }} value={form.send_hour} onChange={set('send_hour')}>
                    {Array.from({ length: 21 }, (_, h) => (
                      <option key={h} value={h}>{hourLabel(h)}</option>
                    ))}
                  </select>
                  <small>Nothing is sent automatically after 9 PM.</small>
                </label>
                <label className="field">
                  <span>Message</span>
                  <textarea
                    ref={messageRef}
                    className="input"
                    rows={4}
                    value={form.message_template || ''}
                    onChange={set('message_template')}
                  />
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

              <div className="save-row">
                <button type="submit" className="btn">Save settings</button>
                {saved && <span className="saved" role="status"><Icon name="check" size={16} />Saved</span>}
              </div>
            </form>
          )}
        </div>

        <div>
          <WhatsAppCard status={status} onUnlink={unlink} />
          <div className="card card-body">
            <h2>Turn off</h2>
            <p className="sub">
              GymPing keeps running in the background, even with this tab closed, so reminders go out on time.
            </p>
            <button type="button" className="btn secondary" onClick={turnOff}>
              <Icon name="power" size={16} />
              Turn GymPing off
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
