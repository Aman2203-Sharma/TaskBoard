import React, { useState, useEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile drawer whenever the route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
    navigate('/');
  };

  return (
    <header className="navbar">
      <div className="navbar__left">
        <Link
          to="/"
          className="navbar__brand"
          title="TaskBoard Home"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span className="navbar__logo" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="#6366F1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="10" y="3" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="17" y="3" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="3" y="10" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="10" y="10" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="17" y="10" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="3" y="17" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="10" y="17" width="4" height="4" rx="1" fill="#6366F1" />
              <rect x="17" y="17" width="4" height="4" rx="1" fill="#6366F1" />
            </svg>
          </span>
          <span className="navbar__title">TaskBoard</span>
        </Link>

        {isAuthenticated ? (
          <nav className="navbar__nav navbar__nav--desktop">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `navbar__link ${isActive ? 'navbar__link--active' : ''}`
              }
            >
              My Boards
            </NavLink>
            <NavLink
              to="/workspaces"
              className={({ isActive }) =>
                `navbar__link ${isActive ? 'navbar__link--active' : ''}`
              }
              title="Manage your workspaces"
            >
              Workspaces
            </NavLink>
          </nav>
        ) : (
          <nav className="navbar__nav navbar__nav--desktop">
            <a href="/#features" className="navbar__link">
              Features
            </a>
          </nav>
        )}
      </div>

      <div className="navbar__right navbar__right--desktop">
        {isAuthenticated ? (
          <>
            {user && (
              <div className="user-pill" title={`Logged in as ${user.email}`}>
                <span>👤</span>
                <span>{user.name}</span>
              </div>
            )}
            <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link to="/login" className="btn btn--ghost btn--sm">
              Log In
            </Link>
            <Link to="/register" className="btn btn--primary btn--sm">
              Get Started
            </Link>
          </div>
        )}
      </div>

      {/* Mobile Hamburger Toggle Button */}
      <button
        type="button"
        className="navbar__hamburger"
        onClick={() => setMobileMenuOpen((prev) => !prev)}
        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>

      {/* Mobile Collapsible Navigation Drawer */}
      {mobileMenuOpen && (
        <>
          <div
            className="navbar__mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="navbar__mobile-drawer">
            {isAuthenticated ? (
              <>
                {user && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.55rem 0.75rem',
                      background: '#f1f5f9',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#1e293b',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>👤</span>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                          fontWeight: 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {user.email}
                      </span>
                    </div>
                  </div>
                )}
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) =>
                    `navbar__mobile-link ${isActive ? 'navbar__mobile-link--active' : ''}`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  📋 My Boards
                </NavLink>
                <NavLink
                  to="/workspaces"
                  className={({ isActive }) =>
                    `navbar__mobile-link ${isActive ? 'navbar__mobile-link--active' : ''}`
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  💼 Workspaces
                </NavLink>
                <div className="navbar__mobile-divider" />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleLogout}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <a
                  href="/#features"
                  className="navbar__mobile-link"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  ✨ Features
                </a>
                <div className="navbar__mobile-divider" />
                <Link
                  to="/login"
                  className="btn btn--ghost btn--sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="btn btn--primary btn--sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </header>
  );
}
