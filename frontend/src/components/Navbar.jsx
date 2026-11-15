import { NavLink } from 'react-router-dom';

const link = ({ isActive }) => ({
  color: '#fff',
  textDecoration: 'none',
  marginLeft: '1.5rem',
  paddingBottom: '2px',
  borderBottom: isActive ? '2px solid #fff' : '2px solid transparent'
});

export default function Navbar() {
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
      <div>
        <NavLink to="/" end style={link}>Dashboard</NavLink>
        <NavLink to="/members" style={link}>Members</NavLink>
        <NavLink to="/settings" style={link}>Settings</NavLink>
      </div>
    </nav>
  );
}
