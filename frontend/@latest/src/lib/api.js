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
  // Guard: reject zero-byte files immediately — Cloudinary will always reject them
  if (file.size === 0) throw new Error('الملف فارغ أو تالف (0 بايت)');

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
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const apiKey    = import.meta.env.VITE_CLOUDINARY_API_KEY;

    // Helper — builds a fresh FormData from the signed parameters
    const buildForm = () => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', apiKey);
      fd.append('timestamp', timestamp);
      fd.append('signature', signature);
      fd.append('folder', 'consignments');
      if (context)   fd.append('context', context);
      if (public_id) fd.append('public_id', public_id);
      return fd;
    };

    // 2. Primary upload — /auto/upload (handles images, video, and most PDFs)
    const autoUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
    const autoResponse = await fetch(autoUrl, { method: 'POST', body: buildForm() });
    const data = await autoResponse.json();

    // 3. Fallback — /raw/upload for scanned/security-restricted PDFs that
    //    Cloudinary's image processor cannot parse ("Invalid image" family of errors).
    //    Cloudinary signatures do NOT encode resource_type, so the same signature
    //    is valid on /raw/upload without re-signing.
    if (data.error && /invalid image/i.test(data.error.message)) {
      console.warn('⚠️  /auto/upload rejected file as invalid image — retrying as /raw/upload');
      const rawUrl = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
      const retryResponse = await fetch(rawUrl, { method: 'POST', body: buildForm() });
      const retryData = await retryResponse.json();
      if (retryData.error) throw new Error(retryData.error.message);
      return retryData.secure_url;
    }

    if (data.error) throw new Error(data.error.message);

    // 4. Return the Cloudinary URL
    return data.secure_url;

  } catch (error) {
    console.error("Direct upload failed:", error);
    throw error;
  }
};