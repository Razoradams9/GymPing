import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { Alert, Empty, PageHead } from '../components/ui';
import { api } from '../api';

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const STATUS_TONE = { active: 'green', pending: 'amber', suspended: 'red' };

// The overseer's view: accounts and totals only. Member details never reach this page.
export default function Admin() {
  const [gyms, setGyms] = useState(null);
  const [error, setError] = useState('');
  const [temp, setTemp] = useState(null); // { name, password }

  async function load() {
    try {
      setGyms(await api('/admin/gyms'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);

  async function setStatus(gym, status) {
    if (status === 'suspended' && !window.confirm(`Suspend ${gym.name}? Their reminders stop until you reactivate them.`)) return;
    setError('');
    try {
      await api(`/admin/gyms/${gym.id}/status`, { method: 'POST', body: { status } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetPassword(gym) {
    if (!window.confirm(`Reset the password for ${gym.name}? Their current password stops working.`)) return;
    setError('');
    try {
      const { temp_password } = await api(`/admin/gyms/${gym.id}/reset-password`, { method: 'POST' });
      setTemp({ name: gym.name, password: temp_password });
    } catch (err) {
      setError(err.message);
    }
  }

  const pending = (gyms || []).filter((g) => g.status === 'pending').length;

  return (
    <div className="page">
      <PageHead
        title="Gyms"
        subtitle={gyms ? `${gyms.length} account${gyms.length === 1 ? '' : 's'}${pending ? `, ${pending} waiting for approval` : ''}` : ''}
      />
      <Alert>{error}</Alert>
      {temp && (
        <Alert tone="green">
          Temporary password for {temp.name}: <span className="temp-password">{temp.password}</span>
          <br />
          Pass it on to the owner and ask them to change it in Settings. It is shown only once.{' '}
          <button className="link-btn" onClick={() => setTemp(null)}>Dismiss</button>
        </Alert>
      )}
      <Alert tone="blue">
        You see accounts and totals here. Members' names, phone numbers and messages are not shown to you.
      </Alert>

      <div className="card">
        {gyms === null ? (
          <div className="empty">Loading…</div>
        ) : gyms.length === 0 ? (
          <Empty icon="users" title="No gyms yet">Gyms appear here when owners create an account.</Empty>
        ) : (
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>Gym</th>
                  <th>Status</th>
                  <th>Members</th>
                  <th>Sent (30 days)</th>
                  <th>WhatsApp</th>
                  <th>Last active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gyms.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div className="person-name">{g.name}</div>
                      <div className="person-sub">{g.email}</div>
                    </td>
                    <td><span className={`badge tone-${STATUS_TONE[g.status] || 'neutral'}`} style={{ textTransform: 'capitalize' }}>{g.status}</span></td>
                    <td>{g.member_count}</td>
                    <td>
                      {g.sent_recent}
                      {g.failed_recent > 0 && <span style={{ color: 'var(--danger-text)' }}> ({g.failed_recent} failed)</span>}
                    </td>
                    <td>
                      <span className={`badge tone-${g.whatsapp_connected ? 'green' : 'neutral'}`}>
                        {g.whatsapp_connected ? 'Connected' : 'Not connected'}
                      </span>
                    </td>
                    <td className="nowrap muted">{g.last_seen_at ? shortDate(g.last_seen_at) : 'Never'}</td>
                    <td className="actions">
                      {g.status === 'active' ? (
                        <button className="btn secondary sm" onClick={() => setStatus(g, 'suspended')}>Suspend</button>
                      ) : (
                        <button className="btn sm" onClick={() => setStatus(g, 'active')}>
                          <Icon name="check" size={15} />
                          {g.status === 'pending' ? 'Approve' : 'Reactivate'}
                        </button>
                      )}
                      <button className="btn ghost" onClick={() => resetPassword(g)} aria-label={`Reset password for ${g.name}`} title="Reset password">
                        <Icon name="refresh" size={16} />
                      </button>
                    </td>
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
