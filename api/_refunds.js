// api/refunds.js
/**
 * Express router for RefundRecord CRUD.
 *
 * Route registration order matters:
 *   GET /count  MUST be defined before  GET /:id
 *   to prevent Express treating the literal string "count" as a Mongo ObjectId.
 */
const express      = require('express');
const router       = express.Router();
const { randomUUID } = require('crypto');     // built-in Node ≥ 14.17, no extra dep
const RefundRecord = require('./models/RefundRecord');

// ─── POST /api/refunds ────────────────────────────────────────────────────────
/**
 * Upsert logic: find by originalConsignmentId, update if found, create if not.
 * The frontend sends both form inputs + precomputed marks/amounts.
 */
router.post('/', async (req, res) => {
  try {
    const {
      originalConsignmentId,
      // Copied survival fields
      fileNumber, companyName, certificateNumber, arrivalPort, supplierName,
      // Form inputs
      releaseDate, containerCount,
      finePaidUntil, guardPaidUntil,
      fineDailyRate, fineCurrency,
      guardDailyRate, guardCurrency,
      isFreeZone, vatPaid,
      // Computed marks + amounts
      hasFineRefund, hasGuardRefund, hasVatRefund,
      fineRefundAmount, guardRefundAmount,
    } = req.body;

    if (!originalConsignmentId)
      return res.status(400).json({ message: 'originalConsignmentId مطلوب' });

    const payload = {
      originalConsignmentId,
      fileNumber:    fileNumber    || '',
      companyName:   companyName   || '',
      certificateNumber: certificateNumber || '',
      arrivalPort:   arrivalPort   || '',
      supplierName:  supplierName  || '',
      releaseDate,
      containerCount: containerCount || 1,
      finePaidUntil,
      guardPaidUntil,
      fineDailyRate:  fineDailyRate  || 0,
      fineCurrency:   fineCurrency   || 'USD',
      guardDailyRate: guardDailyRate || 0,
      guardCurrency:  guardCurrency  || 'EGP',
      isFreeZone:  !!isFreeZone,
      vatPaid:     !!vatPaid,
      hasFineRefund:  !!hasFineRefund,
      hasGuardRefund: !!hasGuardRefund,
      hasVatRefund:   !!hasVatRefund,
      fineRefundAmount:  fineRefundAmount  || 0,
      guardRefundAmount: guardRefundAmount || 0,
    };

    const doc = await RefundRecord.findOneAndUpdate(
      { originalConsignmentId },
      { $set: payload },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(200).json(doc);
  } catch (err) {
    console.error('POST /api/refunds error:', err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── GET /api/refunds/count ───────────────────────────────────────────────────
// MUST be before /:id to avoid "count" being treated as an ObjectId param.
router.get('/count', async (_req, res) => {
  try {
    const count = await RefundRecord.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error('GET /api/refunds/count error:', err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── GET /api/refunds ─────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const docs = await RefundRecord.find().sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    console.error('GET /api/refunds error:', err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── PATCH /api/refunds/:id/todo ──────────────────────────────────────────────
/**
 * Three sub-actions driven by `action` in the body:
 *   'push'   – append a new vatDoc item  { name }
 *   'rename' – update item name          { itemId, name }
 *   'toggle' – flip isChecked            { itemId }
 */
router.patch('/:id/todo', async (req, res) => {
  try {
    const { action, name, itemId } = req.body;
    const doc = await RefundRecord.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'السجل غير موجود' });

    if (action === 'push') {
      if (!name || !name.trim())
        return res.status(400).json({ message: 'اسم العنصر مطلوب' });
      doc.vatDocs.push({ id: randomUUID(), name: name.trim(), isChecked: false });

    } else if (action === 'toggle') {
      const item = doc.vatDocs.find((v) => v.id === itemId);
      if (!item) return res.status(404).json({ message: 'العنصر غير موجود' });
      item.isChecked = !item.isChecked;

    } else if (action === 'rename') {
      const item = doc.vatDocs.find((v) => v.id === itemId);
      if (!item) return res.status(404).json({ message: 'العنصر غير موجود' });
      item.name = name.trim() || item.name;

    } else {
      return res.status(400).json({ message: 'action غير معروف' });
    }

    doc.markModified('vatDocs');
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('PATCH /api/refunds/:id/todo error:', err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── PATCH /api/refunds/:id/recovery ─────────────────────────────────────────
router.patch('/:id/recovery', async (req, res) => {
  try {
    const { recoveredEgp, recoveredUsd } = req.body;
    const doc = await RefundRecord.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          recoveredEgp: Number(recoveredEgp) || 0,
          recoveredUsd: Number(recoveredUsd) || 0,
        },
      },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: 'السجل غير موجود' });
    res.json(doc);
  } catch (err) {
    console.error('PATCH /api/refunds/:id/recovery error:', err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

// ─── DELETE /api/refunds/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password !== process.env.DELETE_PASSWORD)
      return res.status(401).json({ message: 'رمز التأكيد غير صحيح' });

    const doc = await RefundRecord.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'السجل غير موجود' });

    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    console.error('DELETE /api/refunds/:id error:', err.stack);
    res.status(500).json({ message: 'خطأ في الخادم', error: err.message });
  }
});

module.exports = router;
