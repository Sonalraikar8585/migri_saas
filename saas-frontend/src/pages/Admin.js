import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';
import Notification from '../components/Notification';
import { removeToken } from '../utils/auth';

export default function Admin() {
  const [userRole, setUserRole] = useState('');
  const [userId, setUserId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenantName, setTenantName] = useState(''); // may be unused for superadmin
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user', tenant_id: '' });
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [newPlan, setNewPlan] = useState({ name: '', usage_limit: '' });
  const [newFeatureName, setNewFeatureName] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignFeatureId, setAssignFeatureId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await API.get('/user');
      setUserRole(res.data.role);
      setUserId(res.data.id);
      if (res.data.role !== 'superadmin') {
        // only superadmins use this page
        window.location.href = '/dashboard';
      }
      return res.data.role;
    } catch (err) {
      console.warn('user fetch error', err);
      window.location.href = '/login';
    }
  };

  const fetchSubscription = async () => {
    try {
      const res = await API.get('/subscriptions');
      setSubscription(res.data);
    } catch (err) {
      console.warn('subscription fetch error', err);
    }
  };

  // superadmins don't need tenant info; tenant admins will use separate page
  const fetchTenant = async () => {};

  const fetchUsers = async () => {
    try {
      const res = await API.get('/admin/platform/users');
      setUsers(res.data);
    } catch (err) {
      console.warn('users fetch error', err);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await API.get('/admin/platform/tenants');
      setTenants(res.data);
    } catch (err) {
      console.warn('tenants fetch error', err);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await API.get('/admin/plans');
      setPlans(res.data);
    } catch (err) {
      console.warn('plans fetch error', err);
    }
  };

  const fetchFeatures = async () => {
    try {
      const res = await API.get('/admin/features');
      setFeatures(res.data);
    } catch (err) {
      console.warn('features fetch error', err);
    }
  };

  const handleAddPlan = async (e) => {
    e.preventDefault();
    try {
      await API.post('/admin/plans', {
        name: newPlan.name,
        usage_limit: parseInt(newPlan.usage_limit, 10) || 0,
      });
      setNotification({ message: 'Plan created', type: 'success' });
      setNewPlan({ name: '', usage_limit: '' });
      fetchPlans();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Error creating plan',
        type: 'error',
      });
    }
  };

  const handleAddFeature = async (e) => {
    e.preventDefault();
    try {
      await API.post('/admin/features', { name: newFeatureName });
      setNotification({ message: 'Feature created', type: 'success' });
      setNewFeatureName('');
      fetchFeatures();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Error creating feature',
        type: 'error',
      });
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      await API.post(`/admin/plans/${assignPlanId}/features`, { feature_id: assignFeatureId });
      setNotification({ message: 'Feature assigned', type: 'success' });
      setAssignPlanId('');
      setAssignFeatureId('');
      fetchPlans();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Error assigning feature',
        type: 'error',
      });
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await API.post('/admin/users', newUser);
      setNotification({ message: 'User added', type: 'success' });
      setNewUser({ name: '', email: '', password: '', role: 'user', tenant_id: '' });
      fetchUsers();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Error creating user',
        type: 'error',
      });
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

  const handleRoleChange = async (id, role) => {
    try {
      await API.put(`/admin/users/${id}`, { role });
      setNotification({ message: 'Role updated', type: 'success' });
      // if the current user changed their own role, update local state / kick them out
      if (id === userId && role !== userRole) {
        // remove token to force re-login (new role will be issued)
        removeToken();
        // redirect immediately
        window.location.href = '/login';
        return;
      }
      fetchUsers();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Error updating role',
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
      const role = await fetchUser();
      let tasks = [fetchUsers(), fetchTenants(), fetchPlans(), fetchFeatures()];
      await Promise.all(tasks);
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* animated background copied from dashboard */}
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
              <h1 className="text-4xl font-bold text-white">Admin Panel</h1>
              {tenantName && userRole !== 'superadmin' && (
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
            <div className="text-blue-200">Loading admin tools...</div>
          ) : (
            <>
              {/* superadmin only; global plans/features shown below */}

              {/* user management */}
              <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 mb-8">
                <h2 className="text-2xl font-bold text-white mb-4">User Management</h2>
                {/* user creation is superadmin-only and handled below with tenant selector */}
                <form onSubmit={handleAddUser} className="space-y-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input
                      placeholder="Name"
                      className="p-2 rounded bg-slate-700 text-white"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    />
                    <input
                      placeholder="Email"
                      className="p-2 rounded bg-slate-700 text-white"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      className="p-2 rounded bg-slate-700 text-white"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                    <select
                      className="p-2 rounded bg-slate-700 text-white"
                      value={newUser.tenant_id}
                      onChange={(e) => setNewUser({ ...newUser, tenant_id: e.target.value })}
                    >
                      <option value="">Select tenant</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <select
                      className="p-2 rounded bg-slate-700 text-white"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded">
                    Add User
                  </button>
                </form>

                {users.length === 0 ? (
                  <p className="text-blue-200">No users found.</p>
                ) : (
                  <table className="w-full text-white">
                    <thead>
                      <tr>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Email</th>
                        {userRole === 'superadmin' && (
                          <>
                            <th className="px-4 py-2">Tenant</th>
                            <th className="px-4 py-2">Tenant Admin</th>
                            <th className="px-4 py-2">Sub. Status</th>
                          </>
                        )}
                        <th className="px-4 py-2">Role</th>
                        <th className="px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="odd:bg-slate-800 even:bg-slate-700">
                          <td className="px-4 py-2">{u.name}</td>
                          <td className="px-4 py-2">{u.email}</td>
                          {userRole === 'superadmin' && (
                            <>
                              <td className="px-4 py-2">{u.tenant || '-'}</td>
                              <td className="px-4 py-2">{u.tenant_admin_email || '-'}</td>
                              <td className="px-4 py-2">{u.tenant_sub_status || '-'}</td>
                            </>
                          )}
                          <td className="px-4 py-2">
                            <select
                              className="bg-slate-700 text-white p-1 rounded"
                              value={u.role}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
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
                  {/* global plan/feature management (superadmin only, this page is restricted) */}
                  <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 mb-8">
                    <h2 className="text-2xl font-bold text-white mb-4">Create New Plan</h2>
                    <form onSubmit={handleAddPlan} className="space-y-4">
                      <div>
                        <label className="block text-sm text-blue-200 mb-1">Name</label>
                        <input
                          className="w-full p-2 rounded bg-slate-700 text-white"
                          value={newPlan.name}
                          onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-blue-200 mb-1">Usage Limit</label>
                        <input
                          type="number"
                          className="w-full p-2 rounded bg-slate-700 text-white"
                          value={newPlan.usage_limit}
                          onChange={(e) => setNewPlan({ ...newPlan, usage_limit: e.target.value })}
                        />
                      </div>
                      <button
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                      >
                        Add Plan
                      </button>
                    </form>
                  </div>

                  {/* add feature */}
                  <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 mb-8">
                    <h2 className="text-2xl font-bold text-white mb-4">Create New Feature</h2>
                    <form onSubmit={handleAddFeature} className="space-y-4">
                      <div>
                        <label className="block text-sm text-blue-200 mb-1">Feature Name</label>
                        <input
                          className="w-full p-2 rounded bg-slate-700 text-white"
                          value={newFeatureName}
                          onChange={(e) => setNewFeatureName(e.target.value)}
                        />
                      </div>
                      <button
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                      >
                        Add Feature
                      </button>
                    </form>
                  </div>

                  {/* assign feature to plan */}
                  <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 mb-8">
                    <h2 className="text-2xl font-bold text-white mb-4">Assign Feature to Plan</h2>
                    <form onSubmit={handleAssign} className="space-y-4">
                      <div>
                        <label className="block text-sm text-blue-200 mb-1">Choose Plan</label>
                        <select
                          className="w-full p-2 rounded bg-slate-700 text-white"
                          value={assignPlanId}
                          onChange={(e) => setAssignPlanId(e.target.value)}
                        >
                          <option value="">-- select --</option>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-blue-200 mb-1">Choose Feature</label>
                        <select
                          className="w-full p-2 rounded bg-slate-700 text-white"
                          value={assignFeatureId}
                          onChange={(e) => setAssignFeatureId(e.target.value)}
                        >
                          <option value="">-- select --</option>
                          {features.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                      >
                        Assign
                      </button>
                    </form>
                  </div>

              {/* show current plans/features */}
              <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-4">Existing Plans</h2>
                {plans.length === 0 ? (
                  <p className="text-blue-200">No plans defined.</p>
                ) : (
                  <ul className="space-y-2">
                    {plans.map((p) => (
                      <li key={p.id} className="text-white">
                        <span className="font-semibold">{p.name}</span> (limit: {p.usage_limit})
                        {p.features && p.features.length > 0 && (
                          <span className="ml-2 text-green-300">features: {p.features.join(', ')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
