import React from 'react';

interface Props {
  years: number[];
  active?: number | null;
  onSelect: (year: number | null) => void;
}

export const SidebarYears: React.FC<Props> = ({ years, active, onSelect }) => {
  return (
    <aside className="sidebar-years">
      <h4>Ročníky</h4>
      <ul className="sidebar-year-list">
        <li>
          <button
            type="button"
            className={`sidebar-year-button ${active === null ? 'active' : ''}`}
            onClick={() => onSelect(null)}
          >
            Vše
          </button>
        </li>
        {years.map((y) => (
          <li key={y}>
            <button
              type="button"
              className={`sidebar-year-button ${active === y ? 'active' : ''}`}
              onClick={() => onSelect(y)}
            >
              {y}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};
