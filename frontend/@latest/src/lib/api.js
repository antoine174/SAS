export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const fetchApi = async (endpoint, options = {}) => {
  const url = `${API_BASE}${endpoint}`;
  
  // Defensive: Always provide a fallback function if onError is missing
  const onError = (typeof options.onError === 'function') ? options.onError : () => {};

  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API Error at ${url}:`, error);
    onError(error); // Guaranteed to be safe now
    throw error;
  }
};