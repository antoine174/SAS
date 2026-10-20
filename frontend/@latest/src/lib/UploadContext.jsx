// src/lib/UploadContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { fetchApi, uploadDirectToCloudinary } from './api';

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  // Set of active upload/delete keys formatted as `${consignmentId}-${tab}-${key}`
  const [globalUploadingKeys, setGlobalUploadingKeys] = useState(new Set());

  // ── Global Upload Handler ────────────────────────────────────────────────────
  const handleGlobalUpload = useCallback(async (consignmentId, tab, key, file, onSuccess) => {
    if (!file) return null;
    if (file.type !== 'application/pdf') {
      toast.error('يُقبل فقط ملفات PDF');
      return null;
    }

    const uploadKey = `${consignmentId}-${tab}-${key}`;
    setGlobalUploadingKeys((prev) => new Set(prev).add(uploadKey));

    const uploadPromise = (async () => {
      // 1. Upload file directly to Cloudinary
      const publicUrl = await uploadDirectToCloudinary(file);

      // 2. Persist new Cloudinary URL to MongoDB
      const updatedDoc = await fetchApi(`/api/consignments/${consignmentId}/file`, {
        method: 'PATCH',
        body: JSON.stringify({ tab, key, url: publicUrl }),
      });

      // 3. Notify the active modal or screen if currently open
      if (typeof onSuccess === 'function') {
        try {
          onSuccess(updatedDoc);
        } catch (err) {
          console.error('onSuccess callback error:', err);
        }
      }

      return updatedDoc;
    })();

    try {
      return await toast.promise(uploadPromise, {
        pending: `جاري رفع "${file.name}" في الخلفية...`,
        success: `تم رفع "${file.name}" بنجاح ✅`,
        error: {
          render({ data }) {
            return `فشل الرفع: ${data?.message || 'حدث خطأ'}`;
          },
        },
      });
    } catch (err) {
      console.error('handleGlobalUpload error:', err);
      return null;
    } finally {
      setGlobalUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(uploadKey);
        return next;
      });
    }
  }, []);

  // ── Global Delete Handler ────────────────────────────────────────────────────
  const handleGlobalDelete = useCallback(async (consignmentId, tab, key, onSuccess) => {
    const uploadKey = `${consignmentId}-${tab}-${key}`;
    setGlobalUploadingKeys((prev) => new Set(prev).add(uploadKey));

    const deletePromise = (async () => {
      // Send url: null to trigger backend Cloudinary/Supabase asset destroy & DB cleanup
      const updatedDoc = await fetchApi(`/api/consignments/${consignmentId}/file`, {
        method: 'PATCH',
        body: JSON.stringify({ tab, key, url: null }),
      });

      if (typeof onSuccess === 'function') {
        try {
          onSuccess(updatedDoc);
        } catch (err) {
          console.error('onSuccess callback error:', err);
        }
      }

      return updatedDoc;
    })();

    try {
      return await toast.promise(deletePromise, {
        pending: 'جاري حذف الملف في الخلفية...',
        success: 'تم حذف الملف بنجاح',
        error: {
          render({ data }) {
            return `فشل الحذف: ${data?.message || 'حدث خطأ'}`;
          },
        },
      });
    } catch (err) {
      console.error('handleGlobalDelete error:', err);
      return null;
    } finally {
      setGlobalUploadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(uploadKey);
        return next;
      });
    }
  }, []);

  const value = {
    globalUploadingKeys,
    handleGlobalUpload,
    handleGlobalDelete,
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadContext() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUploadContext must be used within an UploadProvider');
  }
  return context;
}
