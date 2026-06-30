require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Consignment = require('./models/Consignment');

const app = express();
const PORT = process.env.PORT || 3000;
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅  MongoDB connected'))
  .catch((err) => { console.error('❌  MongoDB error:', err); process.exit(1); });

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/consignments/search?containerName=&billId=&companyName=
 * Look up an existing consignment by its three unique identifiers.
 * containerName is optional for backwards compatibility (falls back to billId+company).
 */
app.get('/api/consignments/search', async (req, res) => {
  try {
    const { containerName, billId, companyName } = req.query;
    if (!billId || !companyName)
      return res.status(400).json({ message: 'يجب تحديد رقم البوليصة واسم الشركة' });

    // If containerName supplied use all three; otherwise fall back to two-field match
    const query = containerName
      ? { containerName, billId, companyName }
      : { billId, companyName };

    const doc = await Consignment.findOne(query);
    if (!doc) return res.status(404).json({ message: 'لم يتم العثور على الشحنة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * POST /api/consignments
 * Create a new consignment record (metadata only; no files yet).
 * Body: { containerName, billId, companyName }
 */
app.post('/api/consignments', async (req, res) => {
  try {
    const { containerName, billId, companyName } = req.body;
    if (!containerName || !billId || !companyName)
      return res.status(400).json({ message: 'جميع الحقول مطلوبة' });

    // Unique check mirrors the new 3-field compound index
    const existing = await Consignment.findOne({ containerName, billId, companyName });
    if (existing) return res.status(409).json({ message: 'يوجد سجل بهذا الكونتينر مسبقاً', data: existing });

    const doc = await Consignment.create({ containerName, billId, companyName });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * PATCH /api/consignments/:id/file
 * Update a single document field URL after Supabase upload.
 * Body: { tab: 'receipts'|'documents', key: 'cps', url: 'https://...' }
 */
app.patch('/api/consignments/:id/file', async (req, res) => {
  try {
    const { tab, key, url } = req.body;
    if (!['receipts', 'documents'].includes(tab) || !key || !url)
      return res.status(400).json({ message: 'بيانات غير صحيحة' });

    const updatePath = `${tab}.${key}`;
    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: { [updatePath]: url } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * PATCH /api/consignments/:id/cleanup
 * Called after a tab's merged PDF is downloaded WITH the delete option.
 *
 * Workflow:
 *   1. Verify DELETE_PASSWORD – return 401 if wrong.
 *   2. Null ALL URL fields for the requested tab in MongoDB.
 *   3. Inspect the updated document:
 *      - If EVERY field across BOTH tabs is now null/empty →
 *        hard-delete the MongoDB record and return { deleted: true }.
 *      - Otherwise → keep the record, return { deleted: false, doc }.
 *
 * Body: { tab: 'receipts' | 'documents', password: string }
 */
app.patch('/api/consignments/:id/cleanup', async (req, res) => {
  try {
    const { tab, password } = req.body;
    if (!['receipts', 'documents'].includes(tab))
      return res.status(400).json({ message: 'قيمة tab غير صحيحة' });

    // ── Password guard ──────────────────────────────────────────────────────
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    const resetReceipts = {
      'receipts.currentAccount': null,
      'receipts.cps': null,
      'receipts.freightInvoice': null,
      'receipts.freightReceipt': null,
      'receipts.unloadingReceipt': null,
      'receipts.unloadingInvoice': null,
      'receipts.guardReceipt': null,
      'receipts.guardInvoice': null,
      'receipts.fineReceipt': null,
      'receipts.fineInvoice': null,
      'receipts.weightReceipt': null,
      'receipts.analysisReceipt': null,
    };

    const resetDocuments = {
      'documents.firstRelease': null,
      'documents.appendix4': null,
      'documents.invoice': null,
      'documents.declaration': null,
      'documents.insurance': null,
      'documents.houseBillOfLading': null,
      'documents.masterBillOfLading': null,
      'documents.permission': null,
      'documents.euro1': null,
      'documents.analysis': null,
    };

    // Null only the requested tab's fields
    const fields = tab === 'receipts' ? resetReceipts : resetDocuments;

    const doc = await Consignment.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'الشحنة غير موجودة' });

    // ── Hard-delete check ────────────────────────────────────────────────────
    // Convert Mongoose subdocuments to plain objects, then test every value.
    const receiptsEmpty = Object.values(doc.receipts.toObject()).every((v) => !v);
    const documentsEmpty = Object.values(doc.documents.toObject()).every((v) => !v);

    if (receiptsEmpty && documentsEmpty) {
      // Both tabs are now empty → remove the record from MongoDB entirely
      await Consignment.findByIdAndDelete(req.params.id);
      return res.json({ deleted: true });
    }

    // One tab still has files → keep the record, inform the client
    res.json({ deleted: false, doc });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * GET /api/consignments
 * Returns the 10 most recently updated consignments (newest first).
 * Used by the "Recent Consignments" panel on the frontend home screen.
 */
app.get('/api/consignments', async (req, res) => {
  try {
    const docs = await Consignment
      .find()
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('containerName billId companyName updatedAt createdAt');
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

/**
 * GET /api/consignments/:id
 * Returns a single, complete consignment document (including receipts & documents URLs).
 * Used when the user clicks a recent-consignment card, which only holds summary fields.
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
 * DELETE /api/consignments/:id
 * Hard-delete a consignment record (admin use).
 */
app.delete('/api/consignments/:id', async (req, res) => {
  try {
    await Consignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── Start (local dev only) ──────────────────────────────────────────────────
// When imported by Vercel as a serverless function, require.main !== module,
// so app.listen is skipped and the crash is avoided.
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀  Server running on http://localhost:${PORT}`));
}

// Export for Vercel serverless runtime
module.exports = app;