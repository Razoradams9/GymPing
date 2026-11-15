import { useState } from 'react';

export default function MemberForm({ onSubmit, onCancel, initialData }) {
  const [name, setName] = useState(initialData?.name || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [membershipEndDate, setMembershipEndDate] = useState(
    initialData?.membership_end_date || ''
  );

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ name, phone, membership_end_date: membershipEndDate });
  }

  const inputStyle = {
    display: 'block',
    width: '100%',
    padding: '0.6rem 0.8rem',
    marginTop: '0.3rem',
    marginBottom: '1rem',
    borderRadius: '6px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    fontWeight: '600',
    color: '#333'
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '10px',
        padding: '1.5rem',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        maxWidth: '480px',
        margin: '1rem auto'
      }}
    >
      <h3 style={{ marginTop: 0, color: '#1a1a2e' }}>
        {initialData ? 'Edit Member' : 'Add Member'}
      </h3>
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            required
          />
        </label>

        <label style={labelStyle}>
          Phone
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1234567890"
            style={inputStyle}
            required
          />
        </label>

        <label style={labelStyle}>
          Membership End Date
          <input
            type="date"
            value={membershipEndDate}
            onChange={(e) => setMembershipEndDate(e.target.value)}
            style={inputStyle}
            required
          />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            type="submit"
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
            Save Member
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: '#e0e0e0',
              color: '#333',
              border: 'none',
              borderRadius: '6px',
              padding: '0.6rem 1.4rem',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
