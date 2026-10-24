import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [favWork, setFavWork] = useState('');
  const [favFood, setFavFood] = useState('');
  const [favShow, setFavShow] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Full Name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const cleanWork = favWork.trim().toLowerCase();
    const cleanFood = favFood.trim().toLowerCase();
    const cleanShow = favShow.trim().toLowerCase();

    if (!cleanWork || !cleanFood || !cleanShow) {
      setError('All 3 security questions must be answered.');
      return;
    }
    if (/\s/.test(cleanWork) || /\s/.test(cleanFood) || /\s/.test(cleanShow)) {
      setError('Security answers must be 1 single word and all lowercase (no spaces allowed).');
      return;
    }

    setLoading(true);

    try {
      await register(name.trim(), email.trim(), password, cleanWork, cleanFood, cleanShow);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-page min-h-screen w-full flex items-center justify-center py-10 px-4 bg-slate-50 overflow-y-auto"
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1rem',
        backgroundColor: '#f8fafc',
        backgroundImage: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
        overflowY: 'auto',
      }}
    >
      <div
        className="auth-card w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 sm:p-8 my-auto"
        style={{
          width: '100%',
          maxWidth: '28rem',
          backgroundColor: '#ffffff',
          borderRadius: '1rem',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          padding: '1.75rem 2rem',
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <Link
            to="/"
            title="Back to TaskBoard Home"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: '#6366f1',
              color: '#ffffff',
              fontSize: '1.75rem',
              marginBottom: '0.65rem',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="10" y="3" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="17" y="3" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="3" y="10" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="10" y="10" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="17" y="10" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="3" y="17" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="10" y="17" width="4" height="4" rx="1" fill="#ffffff" />
              <rect x="17" y="17" width="4" height="4" rx="1" fill="#ffffff" />
            </svg>
          </Link>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
            Get started
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
            Create your TaskBoard account
          </p>
        </div>

        {error && <div className="modal-alert">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="form-group mb-2.5" style={{ marginBottom: '0.625rem' }}>
            <label className="form-label text-xs font-semibold" htmlFor="regName" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' }}>
              Full Name
            </label>
            <input
              id="regName"
              type="text"
              className="form-input py-2 px-3 text-sm"
              placeholder="Alex Smith"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
            />
          </div>

          <div className="form-group mb-2.5" style={{ marginBottom: '0.625rem' }}>
            <label className="form-label text-xs font-semibold" htmlFor="regEmail" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' }}>
              Email Address
            </label>
            <input
              id="regEmail"
              type="email"
              className="form-input py-2 px-3 text-sm"
              placeholder="alex@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
            />
          </div>

          <div className="form-group mb-2.5" style={{ marginBottom: '0.625rem' }}>
            <label className="form-label text-xs font-semibold" htmlFor="regPassword" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' }}>
              Password (min 6 chars)
            </label>
            <input
              id="regPassword"
              type="password"
              className="form-input py-2 px-3 text-sm"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
            />
          </div>

          {/* Security Questions Section with Helper Banner */}
          <div className="space-y-2.5 gap-2.5 my-2.5" style={{ marginTop: '0.625rem', marginBottom: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <div
              className="p-2.5 text-xs rounded-lg bg-blue-50 border border-blue-200 text-blue-800"
              style={{
                padding: '0.625rem 0.75rem',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e40af',
                fontSize: '0.75rem',
                lineHeight: 1.4,
              }}
            >
              ℹ <strong>Security Questions:</strong> Answers must be 1 single word and all lowercase (e.g. coding, pizza, suits).
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label text-xs font-semibold" htmlFor="regFavWork" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' }}>
                What's your fav. work?
              </label>
              <input
                id="regFavWork"
                type="text"
                className="form-input py-2 px-3 text-sm"
                placeholder="e.g. coding"
                required
                value={favWork}
                onChange={(e) => setFavWork(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label text-xs font-semibold" htmlFor="regFavFood" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' }}>
                What's your fav. food?
              </label>
              <input
                id="regFavFood"
                type="text"
                className="form-input py-2 px-3 text-sm"
                placeholder="e.g. pizza"
                required
                value={favFood}
                onChange={(e) => setFavFood(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label text-xs font-semibold" htmlFor="regFavShow" style={{ fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' }}>
                What's your fav. show?
              </label>
              <input
                id="regFavShow"
                type="text"
                className="form-input py-2 px-3 text-sm"
                placeholder="e.g. suits"
                required
                value={favShow}
                onChange={(e) => setFavShow(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn--primary w-full mt-3 h-10 text-sm font-semibold rounded-lg"
            style={{
              width: '100%',
              marginTop: '0.75rem',
              height: '40px',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
            disabled={loading}
          >
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>
        </form>

        <div
          className="pb-2 text-center text-xs text-slate-500 mt-4"
          style={{
            textAlign: 'center',
            marginTop: '1rem',
            paddingBottom: '0.5rem',
            fontSize: '0.85rem',
            color: '#64748b',
          }}
        >
          Already have an account?{' '}
          <Link
            to="/login"
            style={{ fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
