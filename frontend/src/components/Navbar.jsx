import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav
      style={{
        background: '#1a1a2e',
        color: '#fff',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>🏋️ GymPing</span>
      <div>
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', marginLeft: '1.5rem' }}>
          Dashboard
        </Link>
        <Link to="/members" style={{ color: '#fff', textDecoration: 'none', marginLeft: '1.5rem' }}>
          Members
        </Link>
        <Link to="/settings" style={{ color: '#fff', textDecoration: 'none', marginLeft: '1.5rem' }}>
          Settings
        </Link>
      </div>
    </nav>
  );
}
