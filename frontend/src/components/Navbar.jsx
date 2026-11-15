import { Link, NavLink } from 'react-router-dom';

const link = ({ isActive }) => ({
  color: '#fff',
  textDecoration: 'none',
  marginLeft: '1.5rem',
  paddingBottom: '2px',
  borderBottom: isActive ? '2px solid #fff' : '2px solid transparent'
});

export default function Navbar({ status }) {
  const connected = !!status?.connected;
  return (
    <nav
      style={{
        background: '#1a1a2e',
        color: '#fff',
        padding: '1rem 2rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>🏋️ GymPing</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        {status && (
          <Link
            to="/settings"
            style={{
              background: connected ? '#2e7d32' : '#c62828',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '999px',
              padding: '0.3rem 0.9rem',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            {connected ? '● WhatsApp connected' : '🔗 Connect WhatsApp'}
          </Link>
        )}
        <NavLink to="/" end style={link}>Dashboard</NavLink>
        <NavLink to="/members" style={link}>Members</NavLink>
        <NavLink to="/settings" style={link}>Settings</NavLink>
      </div>
    </nav>
  );
}
