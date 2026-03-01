import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';
import Notification from '../components/Notification';
import { removeToken } from '../utils/auth';

export default function TenantAdmin() {
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState(null);
  const [users, setUsers] = useState([]);
  const [tenantName, setTenantName] = useState('');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await API.get('/user');
      setUserRole(res.data.role);
      setUserId(res.data.id);
      if (res.data.role !== 'admin') {
        // only tenant admins use this page
        window.location.href = '/dashboard';
      }
      return res.data.role;
    } catch (err) {
      console.warn('user fetch error', err);
      window.location.href = '/login';
    }
  };

  const fetchTenant = async () => {
    try {
      const res = await API.get('/tenant');
      setTenantName(res.data.tenant?.name || '');
      // tenant admin can also make use of the returned user list if desired
      if (res.data.users) {
        setUsers(res.data.users);
      }
    } catch (err) {
      console.warn('tenant fetch error', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await API.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.warn('users fetch error', err);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await API.delete(`/admin/users/${id}`);
      setNotification({ message: 'User deleted', type: 'success' });
      fetchUsers();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Error deleting user',
        type: 'error',
      });
    }
  };

  const logout = () => {
    removeToken();
    window.location.reload();
  };

  const closeNotification = () => setNotification({ message: '', type: '' });

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchUser();
      await fetchTenant();
      await fetchUsers();
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div
          className="absolute top-40 right-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDelay: '2s' }}
        ></div>
        <div
          className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"
          style={{ animationDelay: '4s' }}
        ></div>
      </div>

      <div className="relative z-10">
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={closeNotification}
        />

        <div className="bg-slate-800/50 backdrop-blur-lg border-b border-white/20 shadow-sm">
          <div className="max-w-6xl mx-auto px-8 py-6 flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-white">Organization Admin</h1>
              {tenantName && (
                <p className="text-blue-300 text-sm">
                  Organization: <span className="font-semibold text-white">{tenantName}</span>
                </p>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/dashboard"
                className="inline-block text-sm text-yellow-300 underline hover:text-yellow-400"
              >
                Dashboard
              </Link>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-semibold transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-8">
          {loading ? (
            <div className="text-blue-200">Loading...</div>
          ) : (
            <>
              <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 mb-8">
                <h2 className="text-2xl font-bold text-white mb-4">User Management</h2>
                {users.length === 0 ? (
                  <p className="text-blue-200">No users found.</p>
                ) : (
                  <table className="w-full text-white">
                    <thead>
                      <tr>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Email</th>
                        <th className="px-4 py-2">Role</th>
                        <th className="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="odd:bg-slate-800 even:bg-slate-700">
                          <td className="px-4 py-2">{u.name}</td>
                          <td className="px-4 py-2">{u.email}</td>
                          <td className="px-4 py-2">{u.role}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="bg-red-500 hover:bg-red-600 px-2 py-1 rounded text-sm"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
