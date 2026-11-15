// Shared look for all pages.

export const page = { padding: '2rem', maxWidth: '1100px', margin: '0 auto' };

export const card = {
  background: '#fff',
  borderRadius: '8px',
  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  marginBottom: '1.5rem',
  overflowX: 'auto'
};

export const cardTitle = {
  margin: 0,
  padding: '1rem 1.5rem',
  borderBottom: '1px solid #eee',
  color: '#1a1a2e'
};

export const empty = { padding: '1rem 1.5rem', color: '#888', margin: 0 };

export const table = { width: '100%', borderCollapse: 'collapse' };
export const th = { background: '#1a1a2e', color: '#fff', padding: '0.6rem 1rem', textAlign: 'left', whiteSpace: 'nowrap' };
export const td = { padding: '0.6rem 1rem', borderBottom: '1px solid #eee' };

export const input = {
  display: 'block',
  width: '100%',
  padding: '0.6rem 0.8rem',
  marginTop: '0.3rem',
  marginBottom: '1rem',
  borderRadius: '6px',
  border: '1px solid #ccc',
  fontSize: '1rem',
  fontFamily: 'inherit'
};

export const label = { display: 'block', fontWeight: 600, color: '#333' };
export const hint = { color: '#777', fontSize: '0.85rem', fontWeight: 400, margin: '-0.6rem 0 1rem' };

export function button(color = '#1a1a2e', small = false) {
  return {
    background: color,
    color: color === '#e0e0e0' ? '#333' : '#fff',
    border: 'none',
    borderRadius: small ? '4px' : '6px',
    padding: small ? '0.3rem 0.8rem' : '0.6rem 1.4rem',
    fontSize: small ? '0.9rem' : '1rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  };
}

export const colors = { green: '#2e7d32', red: '#c62828', blue: '#1565c0', grey: '#e0e0e0' };

export const errorBox = {
  background: '#ffebee',
  color: '#b71c1c',
  borderRadius: '6px',
  padding: '0.6rem 1rem',
  marginBottom: '1rem'
};

export function rowColor(days) {
  if (days < 0) return '#f3f3f3';
  if (days <= 4) return '#ffebee';
  if (days <= 7) return '#fffde7';
  return '#fff';
}
