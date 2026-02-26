import React, { useState } from 'react';
import { RichTextEditor } from './RichTextEditor';
import API_BASE from '../utils/apiBase';

interface Props { onAdded?: () => void }

export const NewSourceForm: React.FC<Props> = ({ onAdded }) => {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [contentHtml, setContentHtml] = useState('<p></p>');
  const [year, setYear] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
  if (!text.trim()) { setError('Text je povinný'); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string,string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/sources`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title || null,
          text,
          content_html: contentHtml,
          content_json: null,
          year: year || null
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při vytváření');
      setTitle('');
      setText('');
      setContentHtml('<p></p>');
      setYear('');
      onAdded && onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba');
    } finally { setLoading(false); }
  };

  return (
    <div className="new-source-wrapper">
      <form onSubmit={handleSubmit} className="new-source-form">
        <h3 className="new-source-title">Přidat pramen</h3>
        {error && <div className="new-source-error">{error}</div>}
        <div className="new-source-grid">
          <div className="form-group">
            <label>Název (nepovinné)</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Zadejte název pramene..." />
          </div>
          <div className="form-group">
            <label>Rok</label>
            <input value={year as any} onChange={e=>setYear(e.target.value?Number(e.target.value):'')} placeholder="např. 1918" />
          </div>
        </div>
        <div className="form-group">
          <label>Text pramene (povinné)</label>
          <RichTextEditor
            value={contentHtml}
            placeholder="Sepište pramen…"
            onChange={({ html, text: plain }) => {
              setContentHtml(html);
              setText(plain);
            }}
          />
        </div>
        <div className="new-source-footer">
          <span className="new-source-hint">
            💡 Text pramene můžete kdykoliv upravit i po vytvoření
          </span>
          <button type="submit" disabled={loading} className="new-source-submit">{loading? 'Ukládám...':'Uložit pramen'}</button>
        </div>
      </form>
    </div>
  );
};
