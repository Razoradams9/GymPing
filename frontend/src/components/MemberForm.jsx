import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Alert, Avatar } from './ui';
import { api } from '../api';

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

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

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
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={initialData ? 'Edit member' : 'Add member'}>
        <div className="modal-head">
          <h2>{initialData ? 'Edit member' : 'Add member'}</h2>
          <button type="button" className="btn ghost" onClick={onCancel} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          <Alert>{error}</Alert>

          {!initialData &&
            (contacts === null ? (
              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ width: '100%' }}
                  onClick={openContacts}
                  disabled={!whatsappConnected || loadingContacts}
                >
                  <Icon name="phone" />
                  {loadingContacts ? 'Loading contacts…' : 'Pick from WhatsApp contacts'}
                </button>
                {!whatsappConnected && <span className="help">Connect WhatsApp in Settings to pick from your contacts.</span>}
              </div>
            ) : (
              <div className="contacts">
                <input
                  type="text"
                  className="input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search your contacts…"
                  aria-label="Search your contacts"
                  autoFocus
                />
                <div className="contact-list">
                  {shown.length === 0 && <p className="help" style={{ padding: 8 }}>No contacts found.</p>}
                  {shown.map((c) => (
                    <button type="button" className="contact" key={c.phone} onClick={() => pick(c)}>
                      <Avatar name={c.name} />
                      <span>{c.name}</span>
                      <span className="person-sub">{c.phone}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => setContacts(null)}>
                  Type it in instead
                </button>
              </div>
            ))}

          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>Name</span>
              <input type="text" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                type="tel"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+14155552671"
                required
              />
              <small>Include the country code, e.g. +1 for the US or +44 for the UK.</small>
            </label>
            <label className="field">
              <span>Membership end date</span>
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>
            <div className="modal-foot">
              <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving…' : 'Save member'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
