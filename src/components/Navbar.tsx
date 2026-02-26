import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  isAuthenticated: boolean;
  onLogout: () => void;
}

export const Navbar: React.FC<Props> = ({ isAuthenticated, onLogout }) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
  const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null;

  const brandClick = () => {
    navigate(isAuthenticated ? '/dashboard' : '/');
    setMobileMenuOpen(false);
  };

  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `navbar-link${isActive ? ' active' : ''}`;

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        {/* Logo & Brand */}
        <div className="navbar-brand" onClick={brandClick}>
          <div className="navbar-logo">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Outer swoosh */}
              <ellipse cx="50" cy="60" rx="45" ry="18" stroke="#3b82f6" strokeWidth="6" fill="none" transform="rotate(-15 50 50)"/>
              {/* Inner swoosh */}
              <ellipse cx="50" cy="60" rx="38" ry="14" stroke="#60a5fa" strokeWidth="3" fill="none" transform="rotate(-15 50 50)"/>
              {/* Letter B */}
              <text x="50" y="62" textAnchor="middle" fontSize="52" fontWeight="bold" fontFamily="Arial, sans-serif" fill="#1e3a5f">B</text>
            </svg>
          </div>
          <span className="navbar-brand-text">Badatelský dějepis</span>
        </div>

        {/* Mobile menu toggle */}
        <button 
          className={`navbar-mobile-toggle ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        {/* Navigation */}
        <nav className={`navbar-nav ${mobileMenuOpen ? 'open' : ''}`}>
          {isAuthenticated && (
            <div className="navbar-links">
              <NavLink className={navClassName} end to="/dashboard" onClick={handleNavClick}>
                Přehled
              </NavLink>
              <NavLink className={navClassName} to="/add-source" onClick={handleNavClick}>
                + Nový pramen
              </NavLink>
            </div>
          )}

          <div className="navbar-actions">
            <ThemeToggle />
            
            {isAuthenticated ? (
              <div className="navbar-user">
                {username && (
                  <div className="navbar-user-info">
                    <div className="navbar-avatar">
                      {username.charAt(0).toUpperCase()}
                    </div>
                    <div className="navbar-user-details">
                      <span className="navbar-username">{username}</span>
                      {role && <span className="navbar-role">{role}</span>}
                    </div>
                  </div>
                )}
                <button type="button" className="navbar-logout" onClick={onLogout}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16,17 21,12 16,7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              </div>
            ) : (
              <div className="navbar-auth">
                <Link className="navbar-auth-link" to="/" onClick={handleNavClick}>Přihlásit</Link>
                <Link className="navbar-auth-btn" to="/register" onClick={handleNavClick}>Registrace</Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
};
