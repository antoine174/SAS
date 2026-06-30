// src/lib/api.js
/**
 * Dual-environment API base URL.
 *
 * In production (Vercel) Vite sets MODE = 'production', so all requests go
 * through Vercel's rewrite rules (/api → /api/index.js) with no CORS issues.
 *
 * In development (local) requests hit the Express server directly on port 3000.
 */
const API_BASE = import.meta.env.MODE === 'production'
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:3000');

/**
 * Thin fetch wrapper that prepends API_BASE and always returns parsed JSON.
 *
 * @param {string} endpoint  – path starting with '/', e.g. '/api/consignments'
 * @param {RequestInit} [options] – standard fetch options (method, headers, body…)
 * @returns {Promise<any>}   – parsed JSON response body
 */
export const fetchApi = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  return response.json();
};

export { API_BASE };
