require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const cloudinary = require('./config/cloudinary.js');
let supabase = null;
if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL ERROR: Supabase credentials are not set in environment variables.");
} else {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

// ✅ FIX 1: Wrap DNS hack so it ONLY runs locally, NEVER on Vercel.
if (!process.env.VERCEL) {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Consignment = require('./models/Consignment');
const multer = require('multer');

// ✅ FIX 2: Point to the correctly renamed hidden Vercel file
const refundRoutes = require('./_refunds');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// ─── Cloudinary Signature Route ───────────────────────────────────────────────
app.post('/api/cloudinary-sign', (req, res) => {
  const clean = (str) => (str ? String(str).replace(/[|=]/g, '') : 'N/A');
  const { acid, label, companyName, supplierName, certificateNumber, arrivalPort } = req.body || {};

  const paramsToSign = {
    timestamp: Math.round((new Date).getTime() / 1000),
    folder: 'consignments',
  };

  if (acid && label) {
    paramsToSign.public_id = `${clean(acid)}_${clean(label)}_${paramsToSign.timestamp}`;
    paramsToSign.context = `acid=${clean(acid)}|label=${clean(label)}|company=${clean(companyName)}|supplier=${clean(supplierName)}|certificate=${clean(certificateNumber)}|port=${clean(arrivalPort)}`;
  }

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.status(200).json({
    timestamp: paramsToSign.timestamp,
    signature,
    context: paramsToSign.context,
    public_id: paramsToSign.public_id,
  });
});

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅  MongoDB connected');
    await mongoose.connection.db
      .collection('consignments')
      .dropIndex('billId_1_companyName_1')
      .catch(() => { });
  })
  .catch((err) => {
    console.error('❌  MongoDB error:', err);
  });

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is alive' });
});

// ─── Refunds router ───────────────────────────────────────────────────────────
app.use('/api/refunds', refundRoutes);

app.get('/api/consignments', async (req, res) => {
  try {
    const query = {};
    const {
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    } = req.query;

    if (companyName) query.companyName = { $regex: companyName, $options: 'i' };
    if (acid) query.acid = { $regex: acid, $options: 'i' };
    if (invoiceSequenceNumber) query.invoiceSequenceNumber = { $regex: invoiceSequenceNumber, $options: 'i' };
    if (consignmentNumber) query.consignmentNumber = { $regex: consignmentNumber, $options: 'i' };
    if (itemName) query.itemName = { $regex: itemName, $options: 'i' };
    if (count) query.count = { $regex: count, $options: 'i' };
    if (supplierName) query.supplierName = { $regex: supplierName, $options: 'i' };
    if (certificateNumber) query.certificateNumber = { $regex: certificateNumber, $options: 'i' };
    if (arrivalPort) query.arrivalPort = { $regex: arrivalPort, $options: 'i' };
    if (fileNumber) query.fileNumber = { $regex: fileNumber, $options: 'i' };

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      Consignment.countDocuments(query),
      Consignment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);

    res.json({
      data: docs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalRecords: total,
    });
  } catch (err) {
    console.error("GET /api/consignments Error Stack:", err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message, stack: err.stack });
  }
});

app.post('/api/consignments', async (req, res) => {
  try {
    const {
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    } = req.body;

    if (!companyName || !acid)
      return res.status(400).json({ message: 'اسم الشركة ورقم ACID مطلوبان' });

    const doc = await Consignment.create({
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'يوجد سجل بهذا الرقم ACID مسبقاً' });
    if (err.name === 'ValidationError')
      return res.status(400).json({
        message: Object.values(err.errors).map((e) => e.message).join(' | '),
      });
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.put('/api/consignments/:id', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });
    const {
      companyName, acid, invoiceSequenceNumber, consignmentNumber,
      itemName, count, supplierName, certificateNumber, arrivalPort, fileNumber,
    } = req.body;

    if (!companyName || !acid)
      return res.status(400).json({ message: 'اسم الشركة ورقم ACID مطلوبان' });

    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    doc.companyName = companyName;
    doc.acid = acid;
    doc.invoiceSequenceNumber = invoiceSequenceNumber;
    doc.consignmentNumber = consignmentNumber;
    doc.itemName = itemName;
    doc.count = count;
    doc.supplierName = supplierName;
    doc.certificateNumber = certificateNumber;
    doc.arrivalPort = arrivalPort;
    doc.fileNumber = fileNumber;

    await doc.save();
    res.json(doc);
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'يوجد سجل بهذا الرقم ACID مسبقاً' });
    if (err.name === 'ValidationError')
      return res.status(400).json({
        message: Object.values(err.errors).map((e) => e.message).join(' | '),
      });
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.get('/api/consignments/:id', async (req, res) => {
  try {
    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.patch('/api/consignments/:id/file', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });

    const { tab, key, url } = req.body;
    if (!tab || !key) return res.status(400).json({ message: 'Missing required fields (tab or key)' });

    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'بيانات غير صحيحة' });

    // ── Secure deletion: when url is null, destroy the existing asset first ──
    if (url === null || url === undefined) {
      const existing = await Consignment.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'الشحنة غير موجودة' });

      const existingUrl = existing[tab]?.[key];

      if (existingUrl) {
        if (existingUrl.includes('cloudinary.com')) {
          // Extract the public_id from the Cloudinary URL
          // URL format: .../upload/v1234567890/consignments/filename.pdf
          try {
            const afterUpload = existingUrl.split('/upload/')[1];
            // Strip the optional version segment (v<digits>/)
            const withoutVersion = afterUpload.replace(/^v\d+\//, '');
            const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf('.'));
            await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
            console.log(`🗑️  Cloudinary asset destroyed: ${publicId}`);
          } catch (cldErr) {
            // Non-fatal: log but continue so the DB record is still cleared
            console.error('⚠️  Cloudinary destroy error (non-fatal):', cldErr.message);
          }
        } else if (existingUrl.includes(supabaseUrl)) {
          // Supabase legacy file — derive the storage path and remove it
          try {
            if (supabase) {
              // Path is everything after /object/public/consignments/
              const storagePath = existingUrl.split('/object/public/consignments/')[1];
              if (storagePath) {
                const { error: sbErr } = await supabase.storage
                  .from('consignments')
                  .remove([storagePath]);
                if (sbErr) console.warn('⚠️  Supabase remove error (non-fatal):', sbErr.message);
                else console.log(`🗑️  Supabase file removed: ${storagePath}`);
              }
            }
          } catch (sbErr) {
            console.error('⚠️  Supabase remove error (non-fatal):', sbErr.message);
          }
        }
      }
    }

    const updatePath = `${tab}.${key}`;
    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: { [updatePath]: url } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.patch('/api/consignments/:id/cleanup', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });

    const { tab, password } = req.body;
    if (!tab) return res.status(400).json({ message: 'Missing required field: tab' });

    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'قيمة tab غير صحيحة' });
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: { [tab]: {} } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    const receiptsEmpty = Object.keys(doc.receipts || {}).length === 0 || Object.values(doc.receipts || {}).every((v) => !v);
    const documentsEmpty = Object.keys(doc.documents || {}).length === 0 || Object.values(doc.documents || {}).every((v) => !v);

    if (receiptsEmpty && documentsEmpty) {
      await Consignment.findByIdAndDelete(req.params.id);
      return res.json({ deleted: true });
    }
    res.json({ deleted: false, doc });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

app.post('/api/consignments/:id/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const { id } = req.params;
    const { tab, key } = req.body;

    if (!tab || !key) return res.status(400).json({ message: "Missing required fields" });
    if (!supabase) throw new Error("Supabase credentials missing on server");

    const storagePath = `${id}/${key}.pdf`;

    const { error } = await supabase.storage
      .from('consignments')
      .upload(storagePath, req.file.buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/consignments/${storagePath}`;

    const updatePath = `${tab}.${key}`;
    const doc = await Consignment.findByIdAndUpdate(
      id,
      { $set: { [updatePath]: publicUrl } },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: 'Consignment not found' });
    res.status(200).json(doc);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message });
  }
});



app.delete('/api/consignments/:id', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    // 1. Fetch the document FIRST so we can access the Cloudinary URLs 
    // before it gets deleted from MongoDB.
    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    // 2. Delete from MongoDB
    await Consignment.findByIdAndDelete(req.params.id);

    // 3. Supabase Cleanup (Your exact original code)
    try {
      if (!supabase) throw new Error("Supabase credentials missing on server");

      const folder = doc._id.toString();
      const { data: fileList, error: listErr } = await supabase.storage
        .from('consignments')
        .list(folder);

      if (listErr) {
        console.warn('⚠️  Supabase list error:', listErr.message);
      } else if (fileList && fileList.length > 0) {
        const paths = fileList.map((f) => `${folder}/${f.name}`);
        const { error: removeErr } = await supabase.storage
          .from('consignments')
          .remove(paths);
        if (removeErr) console.warn('⚠️  Supabase remove error:', removeErr.message);
        else console.log(`🗑️  Deleted ${paths.length} file(s) from Supabase for "${folder}"`);
      }
    } catch (sbErr) {
      console.error('⚠️  Supabase cleanup error (non-fatal):', sbErr.message);
    }

    // 4. Cloudinary Cleanup — scan all nested URLs in documents & receipts
    try {
      const allUrls = [
        ...Object.values(doc.documents || {}),
        ...Object.values(doc.receipts || {}),
      ].filter((v) => typeof v === 'string' && v.includes('cloudinary.com'));

      for (const fileUrl of allUrls) {
        try {
          // URL format: .../upload/v<digits>/consignments/filename.pdf
          const afterUpload = fileUrl.split('/upload/')[1];
          const withoutVersion = afterUpload.replace(/^v\d+\//, '');
          const publicId = withoutVersion.substring(0, withoutVersion.lastIndexOf('.'));

          await cloudinary.uploader.destroy(publicId, { invalidate: true });
          console.log(`🗑️  Deleted Cloudinary asset: ${publicId}`);
        } catch (innerErr) {
          console.warn(`⚠️  Could not destroy Cloudinary asset for URL ${fileUrl}:`, innerErr.message);
        }
      }
    } catch (cldErr) {
      console.error('⚠️  Cloudinary cleanup error (non-fatal):', cldErr.message);
    }

    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});
// ─── Server bootstrap ─────────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports = app;