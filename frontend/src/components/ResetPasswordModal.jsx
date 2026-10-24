import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function ResetPasswordModal({ isOpen, onClose, onSuccess, initialEmail = '' }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [favWork, setFavWork] = useState('');
  const [favFood, setFavFood] = useState('');
  const [favShow, setFavShow] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmail(initialEmail || '');
      setVerifiedEmail('');
      setFavWork('');
      setFavFood('');
      setFavShow('');
      setNewPassword('');
      setError('');
      setLoading(false);
    }
  }, [isOpen, initialEmail]);

  if (!isOpen) return null;

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/api/auth/verify-email', { email: cleanEmail });
      setVerifiedEmail(res.data?.email || cleanEmail);
      setStep(2);
      setError('');
    } catch (err) {
      if (err.response?.status === 404) {
        setError('No user found with this email');
      } else {
        setError(err.response?.data?.error || 'Failed to verify email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    const cleanWork = favWork.trim().toLowerCase();
    const cleanFood = favFood.trim().toLowerCase();
    const cleanShow = favShow.trim().toLowerCase();

    if (!cleanWork || !cleanFood || !cleanShow) {
      setError('Please answer all 3 security questions.');
      return;
    }

    if (/\s/.test(cleanWork) || /\s/.test(cleanFood) || /\s/.test(cleanShow)) {
      setError('Security answers must be 1 single word and all lowercase (no spaces allowed).');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/api/auth/reset-password', {
        email: verifiedEmail,
        favWork: cleanWork,
        favFood: cleanFood,
        favShow: cleanShow,
        newPassword,
      });

      onSuccess?.(verifiedEmail);
      onClose();
    } catch (err) {
      if (err.response?.status === 401) {
        setError(err.response?.data?.error || 'Incorrect security answers. Please verify your answers.');
      } else {
        setError(err.response?.data?.error || 'Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">
              {step === 1 ? 'Reset Password' : 'Security Verification'}
            </h2>
            <p className="modal__subtitle">
              {step === 1
                ? 'Step 1 of 2: Enter your registered email address'
                : 'Step 2 of 2: Answer your security questions'}
            </p>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className="modal__body">
          {error && <div className="modal-alert">{error}</div>}

          {step === 1 ? (
            <form onSubmit={handleVerifyEmail}>
              <div className="form-group">
                <label className="form-label" htmlFor="resetEmailInput">
                  Registered Email Address
                </label>
                <input
                  id="resetEmailInput"
                  type="email"
                  className="form-input"
                  placeholder="name@company.com"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="modal__footer" style={{ padding: '1rem 0 0', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading || !email.trim()}
                >
                  {loading ? 'Verifying…' : 'Continue'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              {/* Verified Email Pill */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                  padding: '0.45rem 0.75rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Account:</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '9999px',
                      background: '#e0e7ff',
                      color: '#3730a3',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      wordBreak: 'break-all',
                    }}
                  >
                    ✉ {verifiedEmail}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6366f1',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Change
                </button>
              </div>

              {/* Single Notice Banner */}
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1e40af',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  marginBottom: '1rem',
                }}
              >
                ℹ Notice: Answers must be 1 single word and all lowercase.
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="resetFavWork">
                  What's your fav. work?
                </label>
                <input
                  id="resetFavWork"
                  type="text"
                  className="form-input"
                  placeholder="e.g. coding"
                  required
                  autoFocus
                  value={favWork}
                  onChange={(e) => setFavWork(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="resetFavFood">
                  What's your fav. food?
                </label>
                <input
                  id="resetFavFood"
                  type="text"
                  className="form-input"
                  placeholder="e.g. pizza"
                  required
                  value={favFood}
                  onChange={(e) => setFavFood(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="resetFavShow">
                  What's your fav. show?
                </label>
                <input
                  id="resetFavShow"
                  type="text"
                  className="form-input"
                  placeholder="e.g. suits"
                  required
                  value={favShow}
                  onChange={(e) => setFavShow(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="resetNewPassword">
                  New Password (min 6 chars)
                </label>
                <input
                  id="resetNewPassword"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="modal__footer" style={{ padding: '1rem 0 0', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setStep(1);
                    setError('');
                  }}
                  disabled={loading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading || !favWork.trim() || !favFood.trim() || !favShow.trim() || !newPassword}
                >
                  {loading ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
