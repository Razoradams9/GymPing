// All calls to the backend go through here so a required password is handled in one place.

const KEY = 'gymping-password';
let onUnauthorized = () => {};

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function setPassword(pw) {
  try {
    localStorage.setItem(KEY, pw);
  } catch {
    /* private window: the password just won't be remembered */
  }
}

function getPassword() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'x-gymping-password': getPassword(),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) onUnauthorized();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function daysLabel(days) {
  if (days < 0) return `Expired ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}
