import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Footer({ onScrollToDemo }) {
  const { isAuthenticated } = useAuth();

  const handleScrollToDemo = (e) => {
    e.preventDefault();
    if (onScrollToDemo) {
      onScrollToDemo();
      return;
    }
    const el = document.getElementById('demo');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.location.href = '/#demo';
    }
  };

  const handleScrollToFeatures = (e) => {
    e.preventDefault();
    const el = document.getElementById('features');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.location.href = '/#features';
    }
  };

  return (
    <footer className="landing-footer">
      <div className="landing-footer__container">
        {/* 1. Brand Column */}
        <div className="landing-footer__brand-col">
          <div className="landing-footer__brand">
            <span className="navbar__logo" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="20"
                height="20"
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
            <span>TaskBoard</span>
          </div>
          <p className="landing-footer__tagline">
            An intuitive, high-performance Kanban board application engineered
            for clarity, speed, and real-time team collaboration.
          </p>
          <div className="landing-footer__badges">
            <span className="landing-footer__badge">React 19</span>
            <span className="landing-footer__badge">Vite</span>
            <span className="landing-footer__badge">Node.js</span>
            <span className="landing-footer__badge">SQLite WAL</span>
          </div>
        </div>

        {/* 2. Navigation Column */}
        <div>
          <h4 className="landing-footer__col-title">Navigation</h4>
          <ul className="landing-footer__links">
            <li>
              <Link to="/" className="landing-footer__link">
                Home
              </Link>
            </li>
            <li>
              <a
                href="#demo"
                className="landing-footer__link"
                onClick={handleScrollToDemo}
              >
                Demo
              </a>
            </li>
            <li>
              <a
                href="#features"
                className="landing-footer__link"
                onClick={handleScrollToFeatures}
              >
                Features
              </a>
            </li>
            <li>
              <Link to="/dashboard" className="landing-footer__link">
                My Boards
              </Link>
            </li>
            <li>
              <Link to="/workspaces" className="landing-footer__link">
                Workspaces
              </Link>
            </li>
          </ul>
        </div>

        {/* 3. Account Column */}
        <div>
          <h4 className="landing-footer__col-title">Account</h4>
          <ul className="landing-footer__links">
            <li>
              <Link to="/login" className="landing-footer__link">
                Log In
              </Link>
            </li>
            <li>
              <Link to="/register" className="landing-footer__link">
                Get Started
              </Link>
            </li>
            {isAuthenticated && (
              <li>
                <Link to="/dashboard" className="landing-footer__link">
                  Dashboard
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="landing-footer__bottom">
        <div>&copy; 2026 TaskBoard. All rights reserved.</div>
        <div>Designed with React 19, Vite &amp; Express.</div>
      </div>
    </footer>
  );
}
