import React from 'react';
import { Link } from 'react-router-dom';

interface Source {
  id: number;
  title?: string | null;
  text: string;
  summary?: string | null;
  status?: 'draft' | 'published' | 'archived';
  content_html?: string | null;
  year?: number | null;
  owner_name?: string | null;
  created_at?: string;
  published_at?: string | null;
}

interface Props {
  sources: Source[];
}

const buildPreview = (source: Source) => {
  const base = (source.summary ?? '').trim() || source.text.trim();
  const normalized = base.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 220) {
    return normalized;
  }
  return `${normalized.slice(0, 220).trim()}…`;
};

export const SourcesList: React.FC<Props> = ({ sources }) => {
  return (
    <div className="sources-list">
      {sources.length === 0 && <div className="empty-state">Žádné prameny</div>}
      {sources.map((s) => (
        <Link key={s.id} to={`/sources/${s.id}`} className="source-list-link">
          <article className="source-list-item">
            <header className="source-list-header">
              <div className="source-meta">
                {s.year ? `${s.year} · ` : ''}
                {s.owner_name || 'Neznámý'}
              </div>
              {s.status && (
                <span className={`source-status status-${s.status}`}>
                  {s.status === 'draft' ? 'Draft' : s.status === 'archived' ? 'Archivováno' : 'Publikováno'}
                </span>
              )}
            </header>
            {s.title && <h3 className="source-title">{s.title}</h3>}
            <p className="source-preview">{buildPreview(s)}</p>
            <footer className="source-footer">Vloženo: {s.created_at}</footer>
          </article>
        </Link>
      ))}
    </div>
  );
};
