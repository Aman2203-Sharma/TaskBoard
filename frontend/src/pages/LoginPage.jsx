import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ResetPasswordModal from '../components/ResetPasswordModal';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [loading, setLoading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSuccess = (verifiedEmail) => {
    setEmail(verifiedEmail);
    setPassword('');
    setError('');
    setSuccessBanner('Password reset successfully! Please sign in.');
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
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
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
              marginBottom: '0.75rem',
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
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '0.25rem' }}>
            Sign in to manage your team boards
          </p>
        </div>

        {successBanner && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              fontSize: '0.88rem',
              fontWeight: 500,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>✓</span> {successBanner}
          </div>
        )}

        {error && <div className="modal-alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="loginEmail">
              Email Address
            </label>
            <input
              id="loginEmail"
              type="email"
              className="form-input py-2 px-3 text-sm"
              placeholder="name@company.com"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="loginPassword">
                Password
              </label>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6366f1',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  marginBottom: '0.25rem',
                }}
              >
                Forgot Password?
              </button>
            </div>
            <input
              id="loginPassword"
              type="password"
              className="form-input py-2 px-3 text-sm"
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary"
            style={{ width: '100%', marginTop: '0.75rem', height: '42px', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div
          className="pb-2 text-center text-xs text-slate-500 mt-4"
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            paddingBottom: '0.5rem',
            fontSize: '0.85rem',
            color: '#64748b',
          }}
        >
          Don't have an account?{' '}
          <Link to="/register" style={{ fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}>
            Create one free
          </Link>
        </div>
      </div>

      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onSuccess={handleResetSuccess}
      />
    </div>
  );
}
