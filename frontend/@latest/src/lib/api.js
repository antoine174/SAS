// api.js
// This automatically picks the right URL based on where it's running
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const fetchApi = async (url, options = {}) => {
  // Always use the dynamic base URL
  const fullUrl = `${API_BASE_URL}${url}`;

  const onError = (typeof options.onError === 'function') ? options.onError : () => { };

  // Conditionally add headers: let the browser handle boundaries if it's FormData
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(fullUrl, { ...options, headers });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    onError?.(error);
    throw error;
  }
};