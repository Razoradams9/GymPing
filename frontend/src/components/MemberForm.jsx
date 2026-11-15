import { useState } from 'react';
import { api } from '../api';
import { button, colors, errorBox, hint, input, label } from '../ui';

export default function MemberForm({ onSubmit, onCancel, initialData, whatsappConnected }) {
  const [name, setName] = useState(initialData?.name || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [endDate, setEndDate] = useState(initialData?.membership_end_date || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // WhatsApp contact picker
  const [contacts, setContacts] = useState(null);
  const [search, setSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);

  async function openContacts() {
    setError('');
    setLoadingContacts(true);
    try {
      setContacts(await api('/contacts'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingContacts(false);
    }
  }

  function pick(contact) {
    setName(contact.name);
    setPhone(contact.phone);
    setContacts(null);
    setSearch('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit({ name, phone, membership_end_date: endDate });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const q = search.trim().toLowerCase();
  const shown = (contacts || [])
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
    .slice(0, 50);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '10px',
        padding: '1.5rem',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        maxWidth: '480px',
        margin: '0 auto 1.5rem'
      }}
    >
      <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>{initialData ? 'Edit Member' : 'Add Member'}</h3>
      {error && <div style={errorBox}>{error}</div>}

      {!initialData && (
        <div style={{ marginBottom: '1rem' }}>
          {contacts === null ? (
            <>
              <button
                type="button"
                onClick={openContacts}
                disabled={!whatsappConnected || loadingContacts}
                style={{ ...button(colors.green), opacity: whatsappConnected ? 1 : 0.5 }}
              >
                {loadingContacts ? 'Loading contacts…' : '📱 Pick from WhatsApp contacts'}
              </button>
              {!whatsappConnected && (
                <p style={{ ...hint, margin: '0.4rem 0 0' }}>Connect WhatsApp in Settings to pick from your contacts.</p>
              )}
            </>
          ) : (
            <div style={{ border: '1px solid #ccc', borderRadius: '6px', padding: '0.75rem' }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your contacts…"
                style={{ ...input, marginBottom: '0.5rem' }}
                autoFocus
              />
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {shown.length === 0 && <p style={{ color: '#888', margin: '0.5rem 0' }}>No contacts found.</p>}
                {shown.map((c) => (
                  <button
                    type="button"
                    key={c.phone}
                    onClick={() => pick(c)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      width: '100%',
                      padding: '0.5rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer',
                      fontSize: '0.95rem',
                      textAlign: 'left'
                    }}
                  >
                    <span>{c.name}</span>
                    <span style={{ color: '#777' }}>{c.phone}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setContacts(null)} style={{ ...button(colors.grey, true), marginTop: '0.5rem' }}>
                Close
              </button>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label style={label}>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={input} required />
        </label>

        <label style={label}>
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+14155552671"
            style={input}
            required
          />
        </label>
        <p style={hint}>Local numbers work too if you set your country code in Settings.</p>

        <label style={label}>
          Membership End Date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={input} required />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="submit" disabled={saving} style={button()}>
            {saving ? 'Saving…' : 'Save Member'}
          </button>
          <button type="button" onClick={onCancel} style={button(colors.grey)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
