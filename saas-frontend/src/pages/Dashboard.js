import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';
import ProjectForm from '../components/ProjectForm';
import Notification from '../components/Notification';
import { removeToken } from '../utils/auth';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [userName, setUserName] = useState('User');
  const [userRole, setUserRole] = useState('user');
  const [tenantName, setTenantName] = useState('');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await API.get('/user'); // returns {id,name,email,tenant_id,role}
      setUserName(res.data.name || 'User');
      setUserRole(res.data.role || 'user');
    } catch (err) {
      console.warn('User fetch error', err);
      setUserName('User');
    }
  };

  const fetchTenant = async () => {
    try {
      const res = await API.get('/tenant');
      // API now returns { tenant:{id,name}, subscription, users? }
      setTenantName(res.data.tenant?.name || '');
      if (res.data.subscription) {
        setSubscription(res.data.subscription);
      }
    } catch (err) {
      console.warn('tenant fetch error', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await API.get('/projects');
      setProjects(res.data);
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Failed to fetch projects',
        type: 'error'
      });
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

  const fetchPlans = async () => {
    try {
      const res = await API.get('/admin/plans');
      setPlans(res.data);
    } catch (err) {
      console.warn('plans fetch error', err);
    }
  };

  const handleUpgrade = async (planId, planName) => {
    try {
      await API.post('/subscriptions/subscribe', { plan_id: planId });
      setNotification({
        message: `✓ Successfully upgraded to ${planName}!`,
        type: 'success'
      });
      await fetchSubscription();
      fetchHistory();
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || 'Failed to change plan',
        type: 'error'
      });
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await API.get('/subscriptions/history');
      setHistory(res.data);
    } catch (err) {
      console.warn('history fetch error', err);
    }
  };

  const logout = () => {
    removeToken();
    window.location.reload();
  };

  const closeNotification = () => {
    setNotification({ message: '', type: '' });
  };

  useEffect(() => {
    const initDashboard = async () => {
      setLoading(true);
      await Promise.all([
        fetchUser(),
        fetchTenant(),
        fetchProjects(),
        fetchSubscription(),
        fetchPlans(),
        fetchHistory()
      ]);
      setLoading(false);
    };
    initDashboard();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>

      {/* Content with z-index to sit above background */}
      <div className="relative z-10">
      <Notification 
        message={notification.message} 
        type={notification.type} 
        onClose={closeNotification}
      />
      
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-lg border-b border-white/20 shadow-sm">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-white">Dashboard</h1>
              {tenantName && (
                <p className="text-blue-300 text-sm">Organization: <span className="font-semibold text-white">{tenantName}</span></p>
              )}
              <p className="text-blue-200 mt-1">Welcome back, <span className="font-semibold text-white">{userName}</span>!</p>
              {(userRole === 'admin' || userRole === 'superadmin') && (
                <Link
                  to={userRole === 'superadmin' ? '/admin' : '/tenant-admin'}
                  className="inline-block mt-2 text-sm text-yellow-300 underline hover:text-yellow-400"
                >
                  Go to Admin Panel
                </Link>
              )}
            </div>
            <button 
              onClick={logout}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-blue-200 text-lg">Loading your dashboard...</div>
          </div>
        ) : (
          <>
            {/* Subscription Section */}
            {subscription && (
              <div className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 mb-8">
                <h2 className="text-2xl font-bold text-white mb-4">Current Subscription</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-600/40 backdrop-blur-lg p-5 rounded-lg border border-blue-400/50 shadow-lg">
                    <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider">Current Plan</p>
                    <p className="text-3xl font-bold text-white mt-2">{subscription.plan_name || 'Free'}</p>
                  </div>
                  
                  <div className="bg-purple-600/40 backdrop-blur-lg p-5 rounded-lg border border-purple-400/50 shadow-lg">
                    <p className="text-purple-100 text-xs font-semibold uppercase tracking-wider">Projects Limit</p>
                    <p className="text-3xl font-bold text-white mt-2">
                      {projects.length}/{subscription.usage_limit}
                    </p>
                  </div>

                  <div className="bg-green-600/40 backdrop-blur-lg p-5 rounded-lg border border-green-400/50 shadow-lg">
                    <p className="text-green-100 text-xs font-semibold uppercase tracking-wider">Status</p>
                    <p className="text-2xl font-bold text-white mt-2">Active ✓</p>
                  </div>
                </div>

                {subscription.features && subscription.features.length > 0 && (
                  <div className="mb-6">
                    <p className="text-white font-semibold mb-3 text-sm">Included Features:</p>
                    <div className="flex flex-wrap gap-2">
                      {subscription.features.map((feature, idx) => (
                        <span 
                          key={idx}
                          className="bg-green-600/50 backdrop-blur-sm text-green-50 px-3 py-1.5 rounded-full text-xs font-semibold border border-green-400/60"
                        >
                          ✓ {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {plans.length > 0 && (
                  <div className="mb-6">
                    <p className="text-white font-semibold mb-3 text-sm">Upgrade Your Plan:</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {plans
                        .filter(p => p.name !== subscription.plan_name)
                        .map(p => (
                          <button
                            key={p.id}
                            className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2.5 rounded-lg font-semibold text-sm transition transform hover:scale-105"
                            onClick={() => handleUpgrade(p.id, p.name)}
                          >
                            Upgrade to {p.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {history.length > 0 && (
                  <div className="border-t border-white/20 pt-4">
                    <p className="text-white font-semibold mb-3 text-sm">Subscription History:</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {history.map(h => (
                        <div key={h.id} className="flex justify-between items-center bg-slate-700/50 backdrop-blur-sm p-3 rounded-lg border border-white/10">
                          <span className="text-white/95 text-sm">
                            <strong>{h.plan_name}</strong> • {new Date(h.changed_at).toLocaleDateString()}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            h.status === 'active' ? 'bg-green-600/50 text-green-50' : 'bg-gray-600/50 text-gray-200'
                          }`}>
                            {h.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Create Project Section */}
            <div className="mb-8">
              <ProjectForm refresh={fetchProjects} />
            </div>

            {/* Projects List */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">Your Projects ({projects.length})</h2>
              
              {projects.length === 0 ? (
                <div className="bg-slate-800/40 backdrop-blur-lg p-8 rounded-lg shadow-lg border border-white/20 text-center">
                  <p className="text-blue-200 text-sm">No projects yet. Create your first project above!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map(p => (
                    <div 
                      key={p.id} 
                      className="bg-slate-800/40 backdrop-blur-lg p-4 border border-white/20 rounded-lg shadow-sm hover:shadow-md transition transform hover:scale-102"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                        <h3 className="text-base font-semibold text-white">{p.name}</h3>
                      </div>
                      <p className="text-xs text-blue-200 mt-2">Created on {new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Premium Feature Section */}
            {subscription?.features?.includes('PREMIUM_DASHBOARD') && (
              <div className="bg-gradient-to-r from-purple-600/40 to-pink-600/40 backdrop-blur-lg p-6 rounded-lg border-l-4 border-purple-400 shadow-lg">
                <h3 className="text-xl font-bold text-white mb-2">🎉 Premium Dashboard</h3>
                <p className="text-purple-100 text-sm">
                  You have access to advanced analytics and premium features exclusive to Pro and Enterprise subscribers.
                </p>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}