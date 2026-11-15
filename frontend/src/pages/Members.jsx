import { useEffect, useState } from 'react';
import MemberForm from '../components/MemberForm';
import { api, daysLabel, formatDate } from '../api';
import { button, card, colors, empty, errorBox, input, page, rowColor, table, td, th } from '../ui';

export default function Members({ status }) {
  const [members, setMembers] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setMembers(await api('/members'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(fn) {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Errors are shown inside the form, so let them propagate.
  async function handleSubmit(data) {
    if (editing) await api(`/members/${editing.id}`, { method: 'PUT', body: data });
    else await api('/members', { method: 'POST', body: data });
    closeForm();
    await load();
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(m) {
    if (!window.confirm(`Delete ${m.name}?`)) return;
    act(() => api(`/members/${m.id}`, { method: 'DELETE' }));
  }

  const q = search.trim().toLowerCase();
  const shown = (members || []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.phone.includes(q));

  return (
    <div style={page}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Members</h2>
        {!showForm && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} style={button()}>
            + Add Member
          </button>
        )}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {showForm && (
        <MemberForm
          key={editing?.id ?? 'new'}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          initialData={editing}
          whatsappConnected={!!status?.connected}
        />
      )}

      {members && members.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          style={{ ...input, maxWidth: '320px' }}
        />
      )}

      <div style={card}>
        {members === null ? (
          <p style={empty}>Loading…</p>
        ) : members.length === 0 ? (
          <p style={empty}>No members yet. Click "Add Member" to get started.</p>
        ) : shown.length === 0 ? (
          <p style={empty}>No members match your search.</p>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Membership Ends</th>
                <th style={th}>Time Left</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} style={{ background: rowColor(m.days_remaining) }}>
                  <td style={td}>{m.name}</td>
                  <td style={td}>{m.phone}</td>
                  <td style={td}>{formatDate(m.membership_end_date)}</td>
                  <td style={td}>{daysLabel(m.days_remaining)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => act(() => api(`/members/${m.id}/renew`, { method: 'POST' }))}
                      style={{ ...button(colors.green, true), marginRight: '0.5rem' }}
                    >
                      ✓ Renewed
                    </button>
                    <button
                      onClick={() => { setEditing(m); setShowForm(true); window.scrollTo(0, 0); }}
                      style={{ ...button(colors.blue, true), marginRight: '0.5rem' }}
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDelete(m)} style={button(colors.red, true)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
