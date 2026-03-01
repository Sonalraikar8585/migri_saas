import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api",
});

// if a token exists on initial load, configure header so refreshes work
const saved = localStorage.getItem('token');
if (saved) {
  API.defaults.headers.common['Authorization'] = `Bearer ${saved}`;
}

export const setToken = (token) => {
  localStorage.setItem("token", token);
  API.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

export default API;