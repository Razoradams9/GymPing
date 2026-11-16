import Icon from './Icon';
import { daysLabel } from '../api';

export function PageHead({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="head-actions">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'red', children }) {
  if (!children) return null;
  return (
    <div className={`alert tone-${tone}`} role={tone === 'red' ? 'alert' : 'status'}>
      <Icon name={tone === 'green' ? 'check' : tone === 'blue' ? 'users' : 'alert'} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon, title, children }) {
  return (
    <div className="empty">
      <div className="stat-icon tone-neutral"><Icon name={icon} size={20} /></div>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Person({ name, sub }) {
  return (
    <div className="person">
      <div className="avatar" aria-hidden="true">{initials(name)}</div>
      <div>
        <div className="person-name">{name || '—'}</div>
        {sub && <div className="person-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name }) {
  return <div className="avatar" aria-hidden="true">{initials(name)}</div>;
}

export function DaysBadge({ days }) {
  const tone = days < 0 ? 'neutral' : days <= 4 ? 'red' : days <= 7 ? 'amber' : 'green';
  return <span className={`badge tone-${tone}`}>{daysLabel(days)}</span>;
}

export function StatusBadge({ reminder }) {
  const ok = reminder.status === 'sent';
  return (
    <span className={`badge tone-${ok ? 'green' : 'red'}`} title={reminder.error || ''}>
      <Icon name={ok ? 'check' : 'x'} size={13} />
      {ok ? 'Sent' : 'Failed'}
    </span>
  );
}

export function RenewButton({ onClick }) {
  return (
    <button className="btn soft sm" onClick={onClick}>
      <Icon name="check" size={15} />
      Renewed
    </button>
  );
}
