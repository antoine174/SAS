// src/lib/api.js
// Detect if we are on Vercel (production) or local
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin.includes('vercel.app') 
      ? '/api' 
      : 'http://localhost:3000';
  }
  return '/api';
};

export const API_BASE = getBaseUrl();

export const fetchApi = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    return await response.json();
  } catch (error) {
    console.error(`API Error at ${url}:`, error);
    throw error;
  }
};
