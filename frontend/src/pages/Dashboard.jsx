import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { Alert, DaysBadge, Empty, PageHead, Person, RenewButton, StatusBadge } from '../components/ui';
import { api, formatDate, formatDateTime } from '../api';

function Stat({ icon, tone, value, label }) {
  return (
    <div className="stat">
      <div className={`stat-icon tone-${tone}`}><Icon name={icon} size={21} /></div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

// 'YYYY-MM' of a timestamp in local time, to compare against the server's local date.
function monthOf(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Dashboard({ status, gym }) {
  const [members, setMembers] = useState([]);
  const [log, setLog] = useState({ today: '', reminders: [] });
  const [renewals, setRenewals] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const [m, l, r] = await Promise.all([api('/members'), api('/reminders'), api('/renewals')]);
      setMembers(m);
      setLog(l);
      setRenewals(r);
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

  const renew = (m) => act(() => api(`/members/${m.id}/renew`, { method: 'POST' }));

  const todays = new Map(
    log.reminders.filter((r) => r.reminder_date === log.today).map((r) => [r.member_id, r])
  );
  const month = log.today.slice(0, 7);
  const sentThisMonth = log.reminders.filter((r) => r.status === 'sent' && r.reminder_date.startsWith(month)).length;
  const renewedThisMonth = renewals.filter((r) => monthOf(r.renewed_at) === month).length;
  const inWindow = members.filter((m) => m.days_remaining >= 0 && m.days_remaining <= 4);
  const expiringSoon = members.filter((m) => m.days_remaining >= 0 && m.days_remaining <= 7);
  const expired = members.filter((m) => m.days_remaining < 0);
  const failedToday = [...todays.values()].filter((r) => r.status === 'failed').length;
  const todayLabel = log.today
    ? new Date(`${log.today}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="page">
      <PageHead eyebrow={gym.name} title="Dashboard" subtitle={todayLabel}>
        <button
          className="btn"
          disabled={!status?.connected}
          onClick={() =>
            act(
              () => api('/reminders/run', { method: 'POST' }),
              "Sending today's reminders. Messages go out one at a time with a short pause between them."
            )
          }
        >
          <Icon name="send" size={16} />
          Send today's reminders now
        </button>
      </PageHead>

      <Alert>{error}</Alert>
      <Alert tone="green">{notice}</Alert>
      {!gym.payment_url && (
        <Alert tone="amber">
          You haven't added your payment link yet, so reminders go out without one.{' '}
          <Link to="/settings">Add it in Settings</Link>
        </Alert>
      )}

      <div className="stats">
        <Stat icon="users" tone="neutral" value={members.length} label="Total members" />
        <Stat icon="clock" tone="amber" value={inWindow.length} label="Expiring in 4 days" />
        <Stat icon="message" tone="blue" value={sentThisMonth} label="Reminders this month" />
        <Stat icon="refresh" tone="green" value={renewedThisMonth} label="Renewed this month" />
        {failedToday > 0 && <Stat icon="alert" tone="red" value={failedToday} label="Failed today" />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Expiring soon</h2>
          <span className="count">Next 7 days</span>
        </div>
        {expiringSoon.length === 0 ? (
          <Empty icon="check" title="Nobody is expiring this week" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Ends</th>
                  <th>Time left</th>
                  <th>Today's reminder</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expiringSoon.map((m) => {
                  const r = todays.get(m.id);
                  return (
                    <tr key={m.id}>
                      <td><Person name={m.name} sub={m.phone} /></td>
                      <td className="nowrap">{formatDate(m.membership_end_date)}</td>
                      <td><DaysBadge days={m.days_remaining} /></td>
                      <td>
                        {r ? (
                          <StatusBadge reminder={r} />
                        ) : (
                          <span className="badge tone-neutral">
                            {m.reminders_off ? 'Reminders off' : m.days_remaining <= 4 ? 'Waiting' : 'Starts at 4 days'}
                          </span>
                        )}
                      </td>
                      <td className="actions"><RenewButton onClick={() => renew(m)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {expired.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Expired, not renewed</h2>
            <span className="count">{expired.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Ended</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expired.map((m) => (
                  <tr key={m.id}>
                    <td><Person name={m.name} sub={m.phone} /></td>
                    <td className="nowrap">{formatDate(m.membership_end_date)}</td>
                    <td><DaysBadge days={m.days_remaining} /></td>
                    <td className="actions"><RenewButton onClick={() => renew(m)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Reminder log</h2>
        </div>
        {log.reminders.length === 0 ? (
          <Empty icon="message" title="No reminders sent yet">
            They start 4 days before a membership ends.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>When</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {log.reminders.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td><Person name={r.member_name} sub={r.phone} /></td>
                    <td className="nowrap muted">{formatDateTime(r.sent_at)}</td>
                    <td><StatusBadge reminder={r} /></td>
                    <td>
                      {r.status === 'failed' ? (
                        <>
                          {r.error}{' '}
                          {r.reminder_date === log.today && (
                            <button
                              className="btn secondary sm"
                              style={{ marginLeft: 8 }}
                              onClick={() => act(() => api(`/reminders/${r.id}/retry`, { method: 'POST' }))}
                            >
                              <Icon name="refresh" size={14} />
                              Try again
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="muted" style={{ color: 'var(--muted)' }}>
                          Membership ends {formatDate(r.membership_end_date)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Recent renewals</h2>
        </div>
        {renewals.length === 0 ? (
          <Empty icon="refresh" title="No renewals yet">
            Press "Renewed" on a member when they pay.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Renewed on</th>
                  <th>Was</th>
                  <th>Now ends</th>
                </tr>
              </thead>
              <tbody>
                {renewals.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td><Person name={r.member_name} /></td>
                    <td className="nowrap muted">{formatDateTime(r.renewed_at)}</td>
                    <td className="nowrap muted">{formatDate(r.old_end_date)}</td>
                    <td className="nowrap">{formatDate(r.new_end_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
