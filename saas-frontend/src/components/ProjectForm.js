import React, { useState } from "react";
import API from "../api"; // use same API instance
import Notification from "./Notification";

const ProjectForm = ({ refresh, onProjectCreated }) => {
  const [name, setName] = useState("");
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [loading, setLoading] = useState(false);

  const createProject = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.post("/projects", { name });
      setName("");
      setNotification({
        message: `✓ Project "${name}" created successfully!`,
        type: 'success'
      });
      if (refresh) refresh();
      if (onProjectCreated) onProjectCreated(res.data);
    } catch (err) {
      setNotification({
        message: err.response?.data?.error || "Error creating project",
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const closeNotification = () => {
    setNotification({ message: '', type: '' });
  };

  return (
    <>
      <Notification 
        message={notification.message} 
        type={notification.type} 
        onClose={closeNotification}
      />
      <form onSubmit={createProject} className="bg-slate-800/40 backdrop-blur-lg p-6 rounded-lg shadow-lg border border-white/20 hover:shadow-lg transition">
        <h3 className="text-lg font-semibold mb-4 text-white">Create New Project</h3>
        <input
          type="text"
          placeholder="Enter project name"
          className="bg-white/20 text-white placeholder-white/50 border-white/30 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={loading}
        />
        <button 
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 rounded-lg w-full hover:from-blue-600 hover:to-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Project'}
        </button>
      </form>
    </>
  );
};

export default ProjectForm;