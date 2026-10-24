import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function MemberTagInput({
  value = [],
  onChange,
  excludeIds = [],
  existingMemberIds = [],
  availableUsers = null,
  placeholder = 'Search name or enter email…',
  autoFocus = false,
  disabled = false,
  className = '',
}) {
  const { user: currentUser } = useAuth();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [dropdownUsers, setDropdownUsers] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const isFocusedRef = useRef(false);
  const queryRef = useRef('');

  // Keep refs in sync for async callbacks
  isFocusedRef.current = isFocused;
  queryRef.current = query;

  // Compute combined excluded ID set (existing members + logged-in user + already selected chips)
  const excludedSet = useMemo(() => {
    const set = new Set();
    if (currentUser?.id) set.add(Number(currentUser.id));

    // Exclude provided IDs
    const allExclude = [...(excludeIds || []), ...(existingMemberIds || [])];
    allExclude.forEach((id) => {
      if (id !== undefined && id !== null) {
        set.add(Number(id));
      }
    });

    // Also exclude users already added as chips in value
    (value || []).forEach((chip) => {
      if (chip && chip.id) set.add(Number(chip.id));
    });

    return set;
  }, [currentUser, excludeIds, existingMemberIds, value]);

  // Also track excluded emails
  const excludedEmails = useMemo(() => {
    const set = new Set();
    if (currentUser?.email) set.add(currentUser.email.toLowerCase().trim());
    (value || []).forEach((chip) => {
      if (chip && chip.email) set.add(chip.email.toLowerCase().trim());
    });
    return set;
  }, [currentUser, value]);

  // Initials generator
  const getInitials = (nameStr = '', emailStr = '') => {
    const str = nameStr?.trim() || emailStr?.trim() || '';
    if (!str) return 'U';
    if (nameStr?.trim()) {
      const parts = nameStr.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  // Perform search (either locally from availableUsers or via /api/users)
  const performSearch = useCallback(
    async (qStr) => {
      const q = (qStr || '').trim().toLowerCase();

      // STRICT RULE: If search query is empty or input is not focused, dropdown must remain completely hidden
      if (!q || !isFocusedRef.current) {
        setDropdownUsers([]);
        setShowDropdown(false);
        setLoading(false);
        return;
      }

      if (availableUsers && Array.isArray(availableUsers)) {
        // Local filtering from provided availableUsers
        const filtered = availableUsers.filter((u) => {
          if (!u || !u.id) return false;
          if (excludedSet.has(Number(u.id))) return false;
          if (u.email && excludedEmails.has(u.email.toLowerCase().trim())) return false;
          return (
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q))
          );
        });

        // Check if query or focus changed while filtering
        if (queryRef.current.trim().toLowerCase() !== q || !isFocusedRef.current) {
          return;
        }

        setDropdownUsers(filtered);
        setActiveIndex(-1);
        setShowDropdown(true);
        setLoading(false);
        return;
      }

      // API search via /api/users
      setLoading(true);
      try {
        const res = await api.get(`/api/users?q=${encodeURIComponent(q)}`);
        // Check if user changed query or blurred while request was in-flight
        if (queryRef.current.trim().toLowerCase() !== q || !isFocusedRef.current) {
          return;
        }

        const users = res.data?.users || [];
        const filtered = users.filter((u) => {
          if (!u || !u.id) return false;
          if (excludedSet.has(Number(u.id))) return false;
          if (u.email && excludedEmails.has(u.email.toLowerCase().trim())) return false;
          return true;
        });

        setDropdownUsers(filtered);
        setActiveIndex(-1);
        setShowDropdown(true);
      } catch (err) {
        console.error('[MemberTagInput] search error:', err);
        if (queryRef.current.trim().toLowerCase() === q) {
          setDropdownUsers([]);
        }
      } finally {
        if (queryRef.current.trim().toLowerCase() === q) {
          setLoading(false);
        }
      }
    },
    [availableUsers, excludedSet, excludedEmails]
  );

  // Debounced search when query changes
  useEffect(() => {
    const trimmed = query.trim();

    // Immediately hide dropdown when query is cleared
    if (!trimmed || !isFocused) {
      setDropdownUsers([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(trimmed);
    }, 180); // 180ms debounce to eliminate render loops and rapid keystroke jitter

    return () => clearTimeout(timer);
  }, [query, isFocused, performSearch]);

  // Close dropdown and clear query on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setIsFocused(false);
        setQuery('');
        setDropdownUsers([]);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add chip
  const handleAddChip = (userOrEmail) => {
    if (!userOrEmail) return;

    let chipToAdd = null;

    if (typeof userOrEmail === 'object') {
      const email = userOrEmail.email?.trim().toLowerCase();
      if (!email) return;
      if (excludedEmails.has(email)) return;
      chipToAdd = {
        id: userOrEmail.id ? Number(userOrEmail.id) : null,
        name: userOrEmail.name || userOrEmail.email,
        email,
      };
    } else if (typeof userOrEmail === 'string') {
      const email = userOrEmail.trim().toLowerCase();
      if (!email || !email.includes('@')) return;
      if (excludedEmails.has(email)) return;
      chipToAdd = {
        id: null,
        name: email,
        email,
      };
    }

    if (chipToAdd) {
      const updated = [...(value || []), chipToAdd];
      onChange?.(updated);
      setQuery('');
      setShowDropdown(false);
      setDropdownUsers([]);
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  // Remove chip
  const handleRemoveChip = (indexToRemove) => {
    const updated = (value || []).filter((_, idx) => idx !== indexToRemove);
    onChange?.(updated);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  // Keyboard navigation & commits
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showDropdown && dropdownUsers.length > 0 && query.trim().length > 0) {
        setShowDropdown(true);
      }
      setActiveIndex((prev) => (prev < dropdownUsers.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : dropdownUsers.length - 1));
      return;
    }

    if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
      return;
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault(); // Never submit the wrapping form on tag commit

      if (activeIndex >= 0 && dropdownUsers[activeIndex]) {
        handleAddChip(dropdownUsers[activeIndex]);
        return;
      }

      // If user typed an email address or matching name
      const trimmed = query.replace(/,$/, '').trim();
      if (trimmed) {
        const exactMatch = dropdownUsers.find(
          (u) =>
            u.email.toLowerCase() === trimmed.toLowerCase() ||
            u.name?.toLowerCase() === trimmed.toLowerCase()
        );
        if (exactMatch) {
          handleAddChip(exactMatch);
        } else if (trimmed.includes('@')) {
          handleAddChip(trimmed);
        } else if (dropdownUsers.length === 1) {
          handleAddChip(dropdownUsers[0]);
        }
      }
      return;
    }

    if (e.key === 'Backspace' && !query && (value || []).length > 0) {
      // Remove last chip when input is empty
      handleRemoveChip((value || []).length - 1);
    }
  };

  const handleContainerClick = () => {
    inputRef.current?.focus();
  };

  const shouldRenderDropdown = isFocused && query.trim().length > 0 && showDropdown;

  return (
    <div
      className={`tag-input-wrapper ${className}`}
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      <div
        className={`tag-input-container ${disabled ? 'is-disabled' : ''} ${
          isFocused ? 'is-focused' : ''
        }`}
        onClick={handleContainerClick}
      >
        <div className="tag-chips-list" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', width: '100%' }}>
          {(value || []).map((chip, idx) => (
            <span
              key={chip.id ? `id-${chip.id}` : `email-${chip.email}-${idx}`}
              className="member-chip"
            >
              <span className="member-chip__avatar">
                {getInitials(chip.name, chip.email)}
              </span>
              <span
                className="member-chip__label"
                title={
                  chip.name && chip.name !== chip.email
                    ? `${chip.name} (${chip.email})`
                    : chip.email
                }
              >
                {chip.name || chip.email}
              </span>
              {!disabled && (
                <button
                  type="button"
                  className="member-chip__remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveChip(idx);
                  }}
                  aria-label={`Remove ${chip.name || chip.email}`}
                >
                  &times;
                </button>
              )}
            </span>
          ))}

          <input
            ref={inputRef}
            type="text"
            className="tag-input"
            value={query}
            placeholder={(value || []).length === 0 ? placeholder : ''}
            disabled={disabled}
            autoFocus={autoFocus}
            style={{
              flex: '1 1 180px',
              minWidth: '140px',
              width: 'auto',
              outline: 'none',
              border: 'none',
              background: 'transparent',
              textOverflow: 'ellipsis',
            }}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              setIsFocused(true);
              // Only search if there's already text typed
              if (query.trim().length > 0) {
                performSearch(query.trim());
              }
            }}
            onBlur={() => {
              // Delay slightly so item onMouseDown can register
              setTimeout(() => {
                if (
                  containerRef.current &&
                  !containerRef.current.contains(document.activeElement)
                ) {
                  setIsFocused(false);
                  setShowDropdown(false);
                }
              }, 150);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      {shouldRenderDropdown && (
        <div
          className="tag-dropdown search-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            width: '100%',
            maxHeight: '220px',
            overflowY: 'scroll',
            scrollbarGutter: 'stable',
            transform: 'translateZ(0)',
            willChange: 'auto',
            zIndex: 1060,
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            boxSizing: 'border-box',
          }}
        >
          {loading ? (
            <div className="tag-dropdown__empty" style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
              Searching teammates…
            </div>
          ) : dropdownUsers.length === 0 ? (
            <div className="tag-dropdown__empty" style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#64748b' }}>
              No matching teammates found
            </div>
          ) : (
            <div className="tag-dropdown__list" style={{ display: 'flex', flexDirection: 'column' }}>
              {dropdownUsers.map((u, index) => (
                <div
                  key={u.id}
                  className={`tag-dropdown__item ${
                    index === activeIndex ? 'tag-dropdown__item--active' : ''
                  }`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.5rem 0.85rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Keep input from losing focus prematurely
                    handleAddChip(u);
                  }}
                >
                  <span className="tag-dropdown__item-avatar">
                    {getInitials(u.name, u.email)}
                  </span>
                  <div className="tag-dropdown__item-info">
                    <span className="tag-dropdown__item-name">{u.name || u.email}</span>
                    {u.name && <span className="tag-dropdown__item-email">{u.email}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
