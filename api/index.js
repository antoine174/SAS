require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Consignment = require('./models/Consignment');

const app = express();
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  // Added 'PATCH' and 'PUT' to the list
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
      .catch(() => {});
  })
  .catch((err) => { console.error('❌  MongoDB error:', err); process.exit(1); });

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/consignments
 *
 * Multi-field, case-insensitive, partial-match search.
 * Supported query params: companyName, acid, consignmentNumber,
 *                         itemName, count, supplierName
 *
 * Each param is optional. Only the params that are present are added to the
 * MongoDB query, so omitting all params returns ALL records (up to 100).
 *
 * Example:
 *   GET /api/consignments?supplierName=avc&count=7x10
 *   → finds any document where supplierName contains "avc" (case-insensitive)
 *     AND count contains "7x10"
 */
app.get('/api/consignments', async (req, res) => {
  try {
    const query = {};
    const { companyName, acid, invoiceSequenceNumber, consignmentNumber, itemName, count, supplierName } = req.query;

    if (companyName) query.companyName = { $regex: companyName, $options: 'i' };
    if (acid) query.acid = { $regex: acid, $options: 'i' };
    if (invoiceSequenceNumber) query.invoiceSequenceNumber = { $regex: invoiceSequenceNumber, $options: 'i' };
    if (consignmentNumber) query.consignmentNumber = { $regex: consignmentNumber, $options: 'i' };
    if (itemName) query.itemName = { $regex: itemName, $options: 'i' };
    if (count) query.count = { $regex: count, $options: 'i' };
    if (supplierName) query.supplierName = { $regex: supplierName, $options: 'i' };

    const docs = await Consignment.find(query).sort({ createdAt: -1 }).limit(100);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * POST /api/consignments
 *
 * Create a new consignment record.
 * Body: { companyName, acid?, consignmentNumber, itemName?, count?, supplierName? }
 *
 * The `count` field is normalised by the Mongoose pre-save hook before storage.
 */
app.post('/api/consignments', async (req, res) => {
  try {
    const {
      companyName,
      acid,
      invoiceSequenceNumber,
      consignmentNumber,
      itemName,
      count,
      supplierName,
    } = req.body;

    // Only companyName and acid are required
    if (!companyName || !acid)
      return res.status(400).json({ message: 'اسم الشركة ورقم ACID مطلوبان' });

    const doc = await Consignment.create({
      companyName,
      acid,
      invoiceSequenceNumber,
      consignmentNumber,
      itemName,
      count,
      supplierName,
    });

    res.status(201).json(doc);
  } catch (err) {
    // Duplicate ACID – surface as 409 instead of 500
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
 * Update an existing consignment's flat fields.
 */
app.put('/api/consignments/:id', async (req, res) => {
  try {
    const {
      companyName,
      acid,
      invoiceSequenceNumber,
      consignmentNumber,
      itemName,
      count,
      supplierName,
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
 * Returns a single complete consignment document.
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
 * Update a single document-slot URL after a Supabase upload.
 */
app.patch('/api/consignments/:id/file', async (req, res) => {
  try {
    const { tab, key, url } = req.body;
    if (!['receipts', 'documents'].includes(tab) || !key)
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
    const { tab, password } = req.body;
    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'قيمة tab غير صحيحة' });
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    const resetReceipts = {
      'receipts.currentAccount': null, 'receipts.cps': null,
      'receipts.freightInvoice': null, 'receipts.freightReceipt': null,
      'receipts.unloadingReceipt': null, 'receipts.unloadingInvoice': null,
      'receipts.guardReceipt': null, 'receipts.guardInvoice': null,
      'receipts.fineReceipt': null, 'receipts.fineInvoice': null,
      'receipts.weightReceipt': null, 'receipts.analysisReceipt': null,
    };
    const resetDocuments = {
      'documents.firstRelease': null, 'documents.appendix4': null,
      'documents.invoice': null, 'documents.declaration': null,
      'documents.insurance': null, 'documents.houseBillOfLading': null,
      'documents.masterBillOfLading': null, 'documents.permission': null,
      'documents.euro1': null, 'documents.analysis': null,
    };

    const fields = tab === 'receipts' ? resetReceipts : resetDocuments;
    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    const receiptsEmpty = Object.values(doc.receipts || {}).every((v) => !v);
    const documentsEmpty = Object.values(doc.documents || {}).every((v) => !v);

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
 * DELETE /api/consignments/:id
 *
 * Password-guarded hard delete.
 *
 * Security:
 *   - Reads `password` from the request body.
 *   - Compares strictly against process.env.DELETE_PASSWORD.
 *   - Returns 401 if password is missing or wrong.
 *
 * Supabase cleanup (optional):
 *   - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in api/.env to enable.
 *   - Expects files stored under the bucket folder: {consignmentNumber}/
 *   - Errors here are non-fatal and logged to the console.
 */
app.delete('/api/consignments/:id', async (req, res) => {
  try {
    // ── Password guard ───────────────────────────────────────────────────────
    const { password } = req.body;
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    // ── Delete from MongoDB ──────────────────────────────────────────────────
    const doc = await Consignment.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    // ── Supabase storage cleanup (runs only when env vars are configured) ────
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        // Lazy-require so the server starts fine even without the package
        const { createClient } = require('@supabase/supabase-js');
        const adminSupabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false } },
        );

        const folder = doc._id.toString(); // Uses _id for Supabase folder
        const { data: fileList, error: listErr } = await adminSupabase.storage
          .from('consignments')
          .list(folder);

        if (listErr) {
          console.warn('⚠️  Supabase list error:', listErr.message);
        } else if (fileList && fileList.length > 0) {
          const paths = fileList.map((f) => `${folder}/${f.name}`);
          const { error: removeErr } = await adminSupabase.storage
            .from('consignments')
            .remove(paths);
          if (removeErr) console.warn('⚠️  Supabase remove error:', removeErr.message);
          else console.log(`🗑️  Deleted ${paths.length} file(s) from Supabase for "${folder}"`);
        }
      } catch (sbErr) {
        // Non-fatal – MongoDB record is already deleted above
        console.error('⚠️  Supabase cleanup error (non-fatal):', sbErr.message);
      }
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