import React, { useEffect, useState } from 'react';
import { SidebarYears } from '../components/SidebarYears';
import { SourcesList } from '../components/SourcesList';
import API_BASE from '../utils/apiBase';

export const Dashboard: React.FC = () => {
  const [years, setYears] = useState<number[]>([]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const activeLabel = activeYear ? `Rok ${activeYear}` : 'Všechny ročníky';

  const fetchYears = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/years`, { headers });
      const data = await res.json();
      // normalizovat roky na čísla
      const ys = Array.isArray(data.years) ? data.years.map((y: any) => (y === null ? null : Number(y))).filter((v:any)=>v!==null) : [];
      setYears(ys || []);
    } catch (e) { console.error(e); }
  };

  const fetchSources = async (year?: number | null) => {
    try {
      const url = year ? `${API_BASE}/api/sources?year=${year}` : `${API_BASE}/api/sources`;
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(url, { headers });
      const data = await res.json();
      setSources(data.sources || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchYears(); fetchSources(null); }, []);
  useEffect(() => { fetchSources(activeYear); }, [activeYear]);

  return (
    <div className="dashboard-page">
      <SidebarYears years={years} active={activeYear} onSelect={setActiveYear} />
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <h1>Domů</h1>
            <p>{activeLabel}</p>
          </div>
        </header>
        <SourcesList sources={sources} />
      </div>
    </div>
  );
};
