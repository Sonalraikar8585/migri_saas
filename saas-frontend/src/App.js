import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import TenantAdmin from './pages/TenantAdmin';
import { setToken } from './api';
import './App.css';

function App() {
  // start unauthenticated so app boots to login page; token persistence removed
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('');
  const [roleLoaded, setRoleLoaded] = useState(false); // wait until we know the role

  // we'll use window.location for redirects to avoid hook timing issues

  // previously tokens were cleared on every page load; keep them now so
  // navigation between dashboard/admin does not sign the user out.

  // when token is set, fetch current user to know role
  React.useEffect(() => {
    const loadUser = async () => {
      if (user) {
        try {
          const res = await (await import('./api')).default.get('/user');
          setRole(res.data.role || '');
        } catch (err) {
          console.warn('fetch user error', err);
        } finally {
          setRoleLoaded(true);
        }
      } else {
        setRoleLoaded(false);
      }
    };
    loadUser();
  }, [user]);

  // no forced redirect; superadmins can visit the dashboard or admin panel

  const handleLogin = (data) => {
    setToken(data.token);
    setUser(data.token);
  };

  // always render router; routing decisions based on auth state
  if (user && !roleLoaded) {
    // while we don't yet know the role, avoid redirects / flashes
    return null;
  }

  return (
    <Router>
      <div className="App page-transition">
        <Routes>
          {!user && (
            <>
              <Route path="/login" element={<Login onLogin={handleLogin} />} />
              <Route path="/register" element={<Register onLogin={handleLogin} />} />
              <Route path="*" element={<Navigate to="/login" />} />
            </>
          )}

          {user && (
            <>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/tenant-admin" element={<TenantAdmin />} />
              <Route
                path="*"
                element={
                  <Navigate to={role === 'superadmin' ? '/admin' : '/dashboard'} />
                }
              />
            </>
          )}
        </Routes>
      </div>
    </Router>
  );
}

export default App;