import { useEffect, useState } from 'react';
import Icon from './Icon';
import { Alert } from './ui';
import { api } from '../api';

// Reads spreadsheet text saved as CSV: handles quotes, commas inside quotes, and Excel's hidden first character.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

// Finds the name, phone and end-date columns from the header row, or assumes that order.
export function toMembers(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...words) => header.findIndex((h) => words.some((w) => h.includes(w)));
  let cols = { name: find('name'), phone: find('phone', 'mobile', 'number', 'whatsapp'), date: find('end', 'expir', 'valid', 'date') };
  let body = rows.slice(1);
  if (cols.name < 0 || cols.phone < 0 || cols.date < 0) {
    cols = { name: 0, phone: 1, date: 2 };
    body = rows; // no header row
  }
  return body.map((r) => ({
    name: (r[cols.name] || '').trim().replace(/^'/, ''),
    phone: (r[cols.phone] || '').trim(),
    membership_end_date: (r[cols.date] || '').trim()
  }));
}

export default function ImportMembers({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function pick(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setResult(null);
    try {
      const members = toMembers(parseCsv(await file.text()));
      if (members.length === 0) throw new Error('That file has no rows.');
      setRows(members);
      setFileName(file.name);
    } catch (err) {
      setRows(null);
      setError(err.message || 'Could not read that file.');
    }
  }

  async function upload() {
    setBusy(true);
    setError('');
    try {
      setResult(await api('/members/import', { method: 'POST', body: { rows } }));
      setRows(null);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import members">
        <div className="modal-head">
          <h2>Import members</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <Alert>{error}</Alert>
          {result ? (
            <>
              <Alert tone="green">
                {result.added} added, {result.updated} updated
                {result.errors.length > 0 && `, ${result.errors.length} skipped`}.
              </Alert>
              {result.errors.length > 0 && (
                <>
                  <strong>Skipped rows</strong>
                  <ul className="error-list">
                    {result.errors.map((e) => (
                      <li key={e.row}>Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="modal-foot" style={{ marginTop: 16 }}>
                <button className="btn" onClick={onClose}>Done</button>
              </div>
            </>
          ) : (
            <>
              <p className="help" style={{ margin: '0 0 14px' }}>
                Save your spreadsheet as CSV with three columns: <strong>Name</strong>, <strong>Phone</strong>,{' '}
                <strong>End date</strong> (like 25/12/2026). A member whose phone number is already here is updated instead of added twice.
              </p>
              <label className="file-drop">
                <input type="file" accept=".csv,text/csv,text/plain" onChange={pick} />
                <Icon name="plus" /> {fileName || 'Choose a CSV file'}
              </label>
              {rows && (
                <p style={{ marginBottom: 14 }}>
                  Found <strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'}. First: {rows[0].name || '(no name)'}, {rows[0].phone || '(no phone)'}, {rows[0].membership_end_date || '(no date)'}
                </p>
              )}
              <div className="modal-foot">
                <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
                <button type="button" className="btn" disabled={!rows || busy} onClick={upload}>
                  {busy ? 'Importing…' : rows ? `Import ${rows.length} member${rows.length === 1 ? '' : 's'}` : 'Import'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
