import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [members, setMembers] = useState([]);
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    fetch('http://localhost:3001/api/members')
      .then((r) => r.json())
      .then(setMembers)
      .catch(console.error);

    fetch('http://localhost:3001/api/reminders')
      .then((r) => r.json())
      .then(setReminders)
      .catch(console.error);
  }, []);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalMembers = members.length;
  const expiringIn4 = members.filter(
    (m) => m.days_remaining <= 4 && m.days_remaining >= 0
  ).length;
  const remindersThisMonth = reminders.filter((r) => {
    const d = new Date(r.sent_at);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const expiringSoon = members.filter((m) => m.days_remaining <= 7);
  const recentReminders = reminders.slice(0, 10);

  const cardStyle = {
    background: '#fff',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    textAlign: 'center',
    minWidth: '160px',
    flex: '1'
  };

  function rowColor(days) {
    if (days <= 4) return '#ffebee';
    if (days <= 7) return '#fffde7';
    return '#fff';
  }

  const thStyle = {
    background: '#1a1a2e',
    color: '#fff',
    padding: '0.6rem 1rem',
    textAlign: 'left'
  };

  const tdStyle = { padding: '0.6rem 1rem', borderBottom: '1px solid #eee' };

  return (
    <div style={{ padding: '2rem', background: '#f5f5f5', minHeight: '100vh' }}>
      <h2 style={{ color: '#1a1a2e', marginTop: 0 }}>Dashboard</h2>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#1a1a2e' }}>
            {totalMembers}
          </div>
          <div style={{ color: '#666', marginTop: '0.4rem' }}>Total Members</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#e53935' }}>
            {expiringIn4}
          </div>
          <div style={{ color: '#666', marginTop: '0.4rem' }}>Expiring in 4 Days</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#43a047' }}>
            {remindersThisMonth}
          </div>
          <div style={{ color: '#666', marginTop: '0.4rem' }}>Reminders Sent This Month</div>
        </div>
      </div>

      {/* Expiring Soon Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
          marginBottom: '2rem',
          overflow: 'hidden'
        }}
      >
        <h3 style={{ margin: 0, padding: '1rem 1.5rem', borderBottom: '1px solid #eee', color: '#1a1a2e' }}>
          Expiring Soon
        </h3>
        {expiringSoon.length === 0 ? (
          <p style={{ padding: '1rem 1.5rem', color: '#888' }}>No members expiring within 7 days.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Expiry Date</th>
                <th style={thStyle}>Days Remaining</th>
              </tr>
            </thead>
            <tbody>
              {expiringSoon.map((m) => (
                <tr key={m.id} style={{ background: rowColor(m.days_remaining) }}>
                  <td style={tdStyle}>{m.name}</td>
                  <td style={tdStyle}>{m.phone}</td>
                  <td style={tdStyle}>{m.membership_end_date}</td>
                  <td style={tdStyle}>{m.days_remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Reminders Table */}
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}
      >
        <h3 style={{ margin: 0, padding: '1rem 1.5rem', borderBottom: '1px solid #eee', color: '#1a1a2e' }}>
          Recent Reminders
        </h3>
        {recentReminders.length === 0 ? (
          <p style={{ padding: '1rem 1.5rem', color: '#888' }}>No reminders sent yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Member Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Sent At</th>
                <th style={thStyle}>Membership End Date</th>
              </tr>
            </thead>
            <tbody>
              {recentReminders.map((r) => (
                <tr key={r.id}>
                  <td style={tdStyle}>{r.name || '—'}</td>
                  <td style={tdStyle}>{r.phone || '—'}</td>
                  <td style={tdStyle}>{r.sent_at}</td>
                  <td style={tdStyle}>{r.membership_end_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
