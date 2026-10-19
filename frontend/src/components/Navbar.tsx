import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/');
  };

  return (
    <nav className="cv-navbar">
      <Link to="/" className="cv-navbar__logo">
        <img src="/logo.png" alt="" className="cv-navbar__logo-icon" />
        <span className="cv-navbar__logo-text">CineVote</span>
      </Link>
      <div className="cv-navbar__links">
        {user ? (
          <>
            <Link to="/my-dashboard" className="cv-navbar__link">My Groups</Link>
            <Link to="/create"       className="cv-navbar__link cv-navbar__link--ghost">Create</Link>
            <Link to="/join"         className="cv-navbar__link cv-navbar__link--ghost">Join</Link>

            <div className="cv-navbar__profile" ref={profileRef}>
              <button
                className="cv-navbar__profile-trigger"
                onClick={() => setProfileOpen(o => !o)}
                aria-expanded={profileOpen}
                aria-haspopup="true"
              >
                <span className="cv-navbar__profile-avatar">
                  {user.username[0].toUpperCase()}
                </span>
                <span className="cv-navbar__profile-name">{user.username}</span>
                <span className="cv-navbar__profile-chevron" aria-hidden>▾</span>
              </button>

              {profileOpen && (
                <div className="cv-navbar__dropdown" role="menu">
                  <div className="cv-navbar__dropdown-header">
                    <div className="cv-navbar__dropdown-avatar">
                      {user.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="cv-navbar__dropdown-username">{user.username}</div>
                      <div className="cv-navbar__dropdown-email">{user.email}</div>
                    </div>
                  </div>
                  <div className="cv-navbar__dropdown-divider" />
                  <Link
                    to="/my-profile"
                    className="cv-navbar__dropdown-item"
                    onClick={() => setProfileOpen(false)}
                    role="menuitem"
                  >
                    My Profile
                  </Link>
                  <Link
                    to="/my-dashboard"
                    className="cv-navbar__dropdown-item"
                    onClick={() => setProfileOpen(false)}
                    role="menuitem"
                  >
                    My Groups
                  </Link>
                  <div className="cv-navbar__dropdown-divider" />
                  <button
                    className="cv-navbar__dropdown-item cv-navbar__dropdown-item--danger"
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Link to="/create" className="cv-navbar__link">Create a Group</Link>
            <Link to="/join"   className="cv-navbar__link cv-navbar__link--ghost">Join</Link>
            <Link to="/login"  className="cv-navbar__link cv-navbar__link--cta">Sign In</Link>
          </>
        )}
      </div>
    </nav>
  );
}
