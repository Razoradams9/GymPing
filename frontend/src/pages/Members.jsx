import { useCallback, useEffect, useState } from 'react';
import MemberForm from '../components/MemberForm';
import ImportMembers from '../components/ImportMembers';
import Icon from '../components/Icon';
import { Alert, DaysBadge, Empty, PageHead, Person, RenewButton } from '../components/ui';
import { api, formatDate } from '../api';

export default function Members({ status }) {
  const [members, setMembers] = useState(null);
  const [form, setForm] = useState(null); // null | { member } where member is null for "add"
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setMembers(await api('/members'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(fn) {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const closeForm = useCallback(() => setForm(null), []);
  const closeImport = useCallback(() => setImporting(false), []);

  // Errors are shown inside the form, so let them propagate.
  async function handleSubmit(data) {
    if (form.member) await api(`/members/${form.member.id}`, { method: 'PUT', body: data });
    else await api('/members', { method: 'POST', body: data });
    closeForm();
    await load();
  }

  function handleDelete(m) {
    if (!window.confirm(`Delete ${m.name}?`)) return;
    act(() => api(`/members/${m.id}`, { method: 'DELETE' }));
  }

  const q = search.trim().toLowerCase();
  const shown = (members || []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.phone.includes(q));
  const count = members ? `${members.length} member${members.length === 1 ? '' : 's'}` : '';

  return (
    <div className="page">
      <PageHead title="Members" subtitle={count}>
        {members && members.length > 0 && (
          <div className="search">
            <Icon name="search" size={16} />
            <input
              type="search"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or phone"
              aria-label="Search members"
            />
          </div>
        )}
        <button className="btn secondary" onClick={() => setImporting(true)}>Import</button>
        {members && members.length > 0 && (
          <a className="btn secondary" href="/api/members/export" download>Export</a>
        )}
        <button className="btn" onClick={() => setForm({ member: null })}>
          <Icon name="plus" />
          Add member
        </button>
      </PageHead>

      <Alert>{error}</Alert>

      {form && (
        <MemberForm
          key={form.member?.id ?? 'new'}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          initialData={form.member}
          whatsappConnected={!!status?.connected}
        />
      )}

      {importing && <ImportMembers onClose={closeImport} onDone={load} />}

      <div className="card">
        {members === null ? (
          <div className="empty">Loading…</div>
        ) : members.length === 0 ? (
          <Empty icon="users" title="No members yet">
            Add your first member and GymPing will remind them before their membership ends.
          </Empty>
        ) : shown.length === 0 ? (
          <Empty icon="search" title="No members match your search" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Membership ends</th>
                  <th>Time left</th>
                  <th><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id}>
                    <td><Person name={m.name} sub={m.phone} /></td>
                    <td className="nowrap">{formatDate(m.membership_end_date)}</td>
                    <td>
                      <DaysBadge days={m.days_remaining} />
                      {m.reminders_off && <span className="badge tone-neutral" style={{ marginLeft: 6 }}>Reminders off</span>}
                    </td>
                    <td className="actions">
                      <RenewButton onClick={() => act(() => api(`/members/${m.id}/renew`, { method: 'POST' }))} />
                      <button className="btn ghost" onClick={() => setForm({ member: m })} aria-label={`Edit ${m.name}`} title="Edit">
                        <Icon name="pencil" size={16} />
                      </button>
                      <button className="btn ghost danger-hover" onClick={() => handleDelete(m)} aria-label={`Delete ${m.name}`} title="Delete">
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
