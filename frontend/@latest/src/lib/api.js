// api.js
// Uses relative paths for seamless proxying locally and Serverless routes on Vercel
export const fetchApi = async (url, options = {}) => {
  const onError = (typeof options.onError === 'function') ? options.onError : () => { };

  // Conditionally add headers: let the browser handle boundaries if it's FormData
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Auto-attach JWT when the user is logged in
  const token = localStorage.getItem('sas_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const err = new Error(`HTTP error! status: ${response.status}`);
      err.status = response.status;
      try { err.data = await response.json(); } catch { err.data = null; }
      throw err;
    }
    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    onError?.(error);
    throw error;
  }
};

export const uploadDirectToCloudinary = async (file, metadata = {}) => {
  try {
    // 1. Get the secure signature from your backend via POST with JSON metadata
    const payload = typeof metadata === 'string'
      ? { acid: metadata, label: arguments[2] }
      : (metadata || {});

    const token = localStorage.getItem('sas_token');
    const signResponse = await fetch('/api/cloudinary-sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!signResponse.ok) {
      throw new Error(
        signResponse.status === 401
          ? 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً'
          : `Signature request failed (status ${signResponse.status})`
      );
    }
    const { signature, timestamp, context, public_id } = await signResponse.json();

    // 2. Prepare the payload for Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', import.meta.env.VITE_CLOUDINARY_API_KEY);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    formData.append('folder', 'consignments');
    if (context) formData.append('context', context);
    if (public_id) formData.append('public_id', public_id);

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