// api.js
// Uses relative paths for seamless proxying locally and Serverless routes on Vercel
export const fetchApi = async (url, options = {}) => {
  const onError = (typeof options.onError === 'function') ? options.onError : () => { };

  // Conditionally add headers: let the browser handle boundaries if it's FormData
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    onError?.(error);
    throw error;
  }
};