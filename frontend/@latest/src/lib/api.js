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

export const uploadDirectToCloudinary = async (file) => {
  try {
    // 1. Get the secure signature from your backend
    const signResponse = await fetch('/api/cloudinary-sign');
    const { signature, timestamp } = await signResponse.json();

    // 2. Prepare the payload for Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', import.meta.env.VITE_CLOUDINARY_API_KEY);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'consignments');

    // 3. Upload directly to Cloudinary
    const uploadUrl = `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    const data = await uploadResponse.json();
    if (data.error) throw new Error(data.error.message);

    // 4. Return the Cloudinary URL
    return data.secure_url;

  } catch (error) {
    console.error("Direct upload failed:", error);
    throw error;
  }
};