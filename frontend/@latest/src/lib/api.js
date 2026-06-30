export const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // On Vercel, codebase paths already include /api (e.g. fetch(`${API_URL}/api/...`)).
    // Return empty string to prevent /api/api/...
    if (window.location.hostname.includes('vercel.app')) {
      return '';
    }
    // Local development: use dynamic hostname so it works on laptop AND phone.
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return '';
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