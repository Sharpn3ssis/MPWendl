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
    <div style={{display:'flex', justifyContent:'center', padding:'2rem'}}>
      <form onSubmit={handleSubmit} style={{width:'100%',maxWidth:840,background:'var(--surface)',padding:20,borderRadius:10,boxShadow:'0 6px 18px rgba(0,0,0,0.5)'}}>
        <h3 style={{marginTop:0}}>Přidat pramen</h3>
        {error && <div style={{color:'#fca5a5',marginBottom:12}}>{error}</div>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 120px',gap:12,alignItems:'start'}}>
          <div>
            <label style={{display:'block',marginBottom:6,color:'var(--muted)'}}>Název (nepovinné)</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} style={{width:'100%',padding:10,borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--text)'}} />
          </div>
          <div>
            <label style={{display:'block',marginBottom:6,color:'var(--muted)'}}>Rok</label>
            <input value={year as any} onChange={e=>setYear(e.target.value?Number(e.target.value):'')} style={{width:'100%',padding:10,borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',background:'transparent',color:'var(--text)'}} />
          </div>
        </div>
        <div style={{marginTop:12}}>
          <label style={{display:'block',marginBottom:6,color:'var(--muted)'}}>Text pramene (povinné)</label>
          <RichTextEditor
            value={contentHtml}
            placeholder="Sepište pramen…"
            onChange={({ html, text: plain }) => {
              setContentHtml(html);
              setText(plain);
            }}
          />
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:14}}>
          <button type="submit" disabled={loading} style={{padding:'0.5rem 1rem'}}>{loading? 'Ukládám...':'Uložit pramen'}</button>
        </div>
      </form>
    </div>
  );
};
