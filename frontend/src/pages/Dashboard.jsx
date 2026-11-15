import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, daysLabel, formatDate, formatDateTime } from '../api';
import { button, card, cardTitle, colors, empty, errorBox, page, rowColor, table, td, th } from '../ui';

const stat = {
  background: '#fff',
  borderRadius: '8px',
  padding: '1.5rem',
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  textAlign: 'center',
  minWidth: '160px',
  flex: '1'
};

function Stat({ value, label, color }) {
  return (
    <div style={stat}>
      <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ color: '#666', marginTop: '0.4rem' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ reminder }) {
  const ok = reminder.status === 'sent';
  return (
    <span
      title={reminder.error || ''}
      style={{
        background: ok ? '#e8f5e9' : '#ffebee',
        color: ok ? colors.green : colors.red,
        borderRadius: '4px',
        padding: '0.15rem 0.5rem',
        fontWeight: 600,
        fontSize: '0.85rem',
        whiteSpace: 'nowrap'
      }}
    >
      {ok ? '✓ Sent' : '✗ Failed'}
    </span>
  );
}

export default function Dashboard({ status }) {
  const [members, setMembers] = useState([]);
  const [log, setLog] = useState({ today: '', reminders: [] });
  const [renewals, setRenewals] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const [m, l, r, s] = await Promise.all([
        api('/members'),
        api('/reminders'),
        api('/renewals'),
        api('/settings')
      ]);
      setMembers(m);
      setLog(l);
      setRenewals(r);
      setSettings(s);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  async function act(fn, done) {
    setError('');
    setNotice('');
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const todays = new Map(
    log.reminders.filter((r) => r.reminder_date === log.today).map((r) => [r.member_id, r])
  );
  const month = log.today.slice(0, 7);
  const sentThisMonth = log.reminders.filter((r) => r.status === 'sent' && r.reminder_date.startsWith(month)).length;
  const renewedThisMonth = renewals.filter((r) => formatMonth(r.renewed_at) === month).length;
  const inWindow = members.filter((m) => m.days_remaining >= 0 && m.days_remaining <= 4);
  const expiringSoon = members.filter((m) => m.days_remaining >= 0 && m.days_remaining <= 7);
  const expired = members.filter((m) => m.days_remaining < 0);
  const failedToday = [...todays.values()].filter((r) => r.status === 'failed').length;

  return (
    <div style={page}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#1a1a2e', margin: 0 }}>Dashboard</h2>
        <button
          onClick={() =>
            act(
              () => api('/reminders/run', { method: 'POST' }),
              "Sending today's reminders now. Messages go out one at a time with a short pause between them."
            )
          }
          disabled={!status?.connected}
          style={{ ...button(colors.green), opacity: status?.connected ? 1 : 0.5 }}
        >
          Send today's reminders now
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {notice && <div style={{ ...errorBox, background: '#e8f5e9', color: colors.green }}>{notice}</div>}
      {settings && !settings.payment_url && (
        <div style={{ ...errorBox, background: '#fff8e1', color: '#8d6e00' }}>
          You haven't added your payment link yet, so reminders go out without one.{' '}
          <Link to="/settings">Add it in Settings</Link>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <Stat value={members.length} label="Total Members" color="#1a1a2e" />
        <Stat value={inWindow.length} label="Expiring in 4 Days" color="#e53935" />
        <Stat value={sentThisMonth} label="Reminders Sent This Month" color="#1565c0" />
        <Stat value={renewedThisMonth} label="Renewed This Month" color="#43a047" />
        {failedToday > 0 && <Stat value={failedToday} label="Failed Today" color="#c62828" />}
      </div>

      <div style={card}>
        <h3 style={cardTitle}>Expiring Soon</h3>
        {expiringSoon.length === 0 ? (
          <p style={empty}>No members expiring within 7 days.</p>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Ends</th>
                <th style={th}>Time Left</th>
                <th style={th}>Today's Reminder</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {expiringSoon.map((m) => {
                const r = todays.get(m.id);
                return (
                  <tr key={m.id} style={{ background: rowColor(m.days_remaining) }}>
                    <td style={td}>{m.name}</td>
                    <td style={td}>{m.phone}</td>
                    <td style={td}>{formatDate(m.membership_end_date)}</td>
                    <td style={td}>{daysLabel(m.days_remaining)}</td>
                    <td style={td}>
                      {r ? <StatusBadge reminder={r} /> : m.days_remaining <= 4 ? 'Waiting' : 'Starts at 4 days'}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => act(() => api(`/members/${m.id}/renew`, { method: 'POST' }))}
                        style={button(colors.green, true)}
                      >
                        ✓ Renewed
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {expired.length > 0 && (
        <div style={card}>
          <h3 style={cardTitle}>Expired, Not Renewed</h3>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Ended</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {expired.map((m) => (
                <tr key={m.id}>
                  <td style={td}>{m.name}</td>
                  <td style={td}>{m.phone}</td>
                  <td style={td}>{formatDate(m.membership_end_date)} ({daysLabel(m.days_remaining).toLowerCase()})</td>
                  <td style={td}>
                    <button
                      onClick={() => act(() => api(`/members/${m.id}/renew`, { method: 'POST' }))}
                      style={button(colors.green, true)}
                    >
                      ✓ Renewed
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={card}>
        <h3 style={cardTitle}>Reminder Log</h3>
        {log.reminders.length === 0 ? (
          <p style={empty}>No reminders sent yet.</p>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Member</th>
                <th style={th}>Phone</th>
                <th style={th}>When</th>
                <th style={th}>Status</th>
                <th style={th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {log.reminders.slice(0, 30).map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.member_name || '—'}</td>
                  <td style={td}>{r.phone || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDateTime(r.sent_at)}</td>
                  <td style={td}><StatusBadge reminder={r} /></td>
                  <td style={td}>
                    {r.status === 'failed' ? (
                      <>
                        {r.error}{' '}
                        {r.reminder_date === log.today && (
                          <button
                            onClick={() => act(() => api(`/reminders/${r.id}/retry`, { method: 'POST' }))}
                            style={{ ...button(colors.blue, true), marginLeft: '0.5rem' }}
                          >
                            Try again
                          </button>
                        )}
                      </>
                    ) : (
                      `Membership ends ${formatDate(r.membership_end_date)}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <h3 style={cardTitle}>Recent Renewals</h3>
        {renewals.length === 0 ? (
          <p style={empty}>No renewals yet. Press "Renewed" on a member when they pay.</p>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Member</th>
                <th style={th}>Renewed On</th>
                <th style={th}>Was</th>
                <th style={th}>Now Ends</th>
              </tr>
            </thead>
            <tbody>
              {renewals.slice(0, 15).map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.member_name || '—'}</td>
                  <td style={td}>{formatDateTime(r.renewed_at)}</td>
                  <td style={td}>{formatDate(r.old_end_date)}</td>
                  <td style={td}>{formatDate(r.new_end_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 'YYYY-MM' of a timestamp in local time, to compare against the server's local date.
function formatMonth(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
