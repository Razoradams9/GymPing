import { useEffect, useState } from 'react';
import MemberForm from '../components/MemberForm';

const API = 'http://localhost:3001';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  async function fetchMembers() {
    try {
      const res = await fetch(`${API}/api/members`);
      const data = await res.json();
      setMembers(data);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    }
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  async function handleFormSubmit(data) {
    try {
      if (editingMember) {
        await fetch(`${API}/api/members/${editingMember.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        await fetch(`${API}/api/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }
      setShowForm(false);
      setEditingMember(null);
      fetchMembers();
    } catch (err) {
      console.error('Failed to save member:', err);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this member?')) return;
    try {
      await fetch(`${API}/api/members/${id}`, { method: 'DELETE' });
      fetchMembers();
    } catch (err) {
      console.error('Failed to delete member:', err);
    }
  }

  function handleEdit(member) {
    setEditingMember(member);
    setShowForm(true);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingMember(null);
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Members</h2>
        {!showForm && (
          <button
            onClick={() => { setEditingMember(null); setShowForm(true); }}
            style={{
              background: '#1a1a2e',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.6rem 1.4rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            + Add Member
          </button>
        )}
      </div>

      {showForm && (
        <MemberForm
          onSubmit={handleFormSubmit}
          onCancel={handleCancel}
          initialData={editingMember}
        />
      )}

      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}
      >
        {members.length === 0 ? (
          <p style={{ padding: '1.5rem', color: '#888' }}>No members yet. Click "Add Member" to get started.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Membership End Date</th>
                <th style={thStyle}>Days Remaining</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ background: rowColor(m.days_remaining) }}>
                  <td style={tdStyle}>{m.name}</td>
                  <td style={tdStyle}>{m.phone}</td>
                  <td style={tdStyle}>{m.membership_end_date}</td>
                  <td style={tdStyle}>{m.days_remaining}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleEdit(m)}
                      style={{
                        background: '#1565c0',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.3rem 0.8rem',
                        cursor: 'pointer',
                        marginRight: '0.5rem'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      style={{
                        background: '#c62828',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.3rem 0.8rem',
                        cursor: 'pointer'
                      }}
                    >
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
