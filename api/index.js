require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (!supabaseUrl || !supabaseKey) {
  console.error("FATAL ERROR: Supabase credentials are not set in environment variables.");
  // Removed process.exit(1) because it crashes Vercel Serverless Functions immediately
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
const fs = require('fs');

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
// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅  MongoDB connected');
    // Ensure the legacy index is dropped on startup
    await mongoose.connection.db
      .collection('consignments')
      .dropIndex('billId_1_companyName_1')
      .catch(() => { });
  })
  .catch((err) => {
    console.error('❌  MongoDB error:', err);
  });

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/health
 * Health check endpoint for Vercel verification
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Backend is alive' });
});

// ─── Refunds router ───────────────────────────────────────────────────────────
app.use('/api/refunds', refundRoutes);

/**
 * GET /api/consignments
 */
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

/**
 * POST /api/consignments
 */
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

/**
 * PUT /api/consignments/:id
 */
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

/**
 * GET /api/consignments/:id
 */
app.get('/api/consignments/:id', async (req, res) => {
  try {
    const doc = await Consignment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * PATCH /api/consignments/:id/file
 */
app.patch('/api/consignments/:id/file', async (req, res) => {
  try {
    if (!req.body) return res.status(400).json({ message: 'Request body is missing' });

    const { tab, key, url } = req.body;
    if (!tab || !key) return res.status(400).json({ message: 'Missing required fields (tab or key)' });

    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'بيانات غير صحيحة' });

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

/**
 * PATCH /api/consignments/:id/cleanup
 */
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

/**
 * POST /api/consignments/:id/upload
 */
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

/**
 * DELETE /api/consignments/:id
 */
app.delete('/api/consignments/:id', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    const doc = await Consignment.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

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