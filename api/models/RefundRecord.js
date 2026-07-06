// api/models/RefundRecord.js
/**
 * RefundRecord — Decoupled accounting document.
 *
 * ARCHITECTURE NOTE:
 *   `originalConsignmentId` is stored as a plain String (not an ObjectId ref).
 *   Base details (fileNumber, companyName, etc.) are PHYSICALLY COPIED from
 *   the consignment at save-time.  This means the record survives even if the
 *   parent Consignment document is hard-deleted.
 */
const mongoose = require('mongoose');

const vatDocSchema = new mongoose.Schema(
  {
    id:        { type: String, required: true },
    name:      { type: String, required: true },
    isChecked: { type: Boolean, default: false },
  },
  { _id: false },
);

const refundRecordSchema = new mongoose.Schema(
  {
    // ── Copied base details (survival fields) ─────────────────────────────────
    originalConsignmentId: { type: String, required: true, unique: true },
    fileNumber:            { type: String, default: '' },
    companyName:           { type: String, default: '' },
    certificateNumber:     { type: String, default: '' },
    arrivalPort:           { type: String, default: '' },
    supplierName:          { type: String, default: '' },

    // ── Form inputs ───────────────────────────────────────────────────────────
    releaseDate:      { type: Date },                             // تاريخ الصرف
    containerCount:   { type: Number, default: 1 },              // عدد الحاويات
    finePaidUntil:    { type: Date },                            // آخر يوم مدفوع (غرامة)
    guardPaidUntil:   { type: Date },                            // آخر يوم مدفوع (حراسة)
    fineDailyRate:    { type: Number, default: 0 },              // سعر اليوم غرامة/حاوية
    fineCurrency:     { type: String, enum: ['EGP', 'USD'], default: 'USD' },
    guardDailyRate:   { type: Number, default: 0 },              // سعر اليوم حراسة/حاوية
    guardCurrency:    { type: String, enum: ['EGP', 'USD'], default: 'EGP' },
    isFreeZone:       { type: Boolean, default: false },         // مناطق حرة
    vatPaid:          { type: Boolean, default: false },         // تم دفع قيمة مضافة

    // ── Computed marks (set by frontend before POST) ──────────────────────────
    hasFineRefund:    { type: Boolean, default: false },
    hasGuardRefund:   { type: Boolean, default: false },
    hasVatRefund:     { type: Boolean, default: false },

    // ── Computed amounts ──────────────────────────────────────────────────────
    fineRefundAmount:  { type: Number, default: 0 },
    guardRefundAmount: { type: Number, default: 0 },

    // ── Dynamic VAT to-do checklist ───────────────────────────────────────────
    vatDocs: { type: [vatDocSchema], default: [] },

    // ── Final recovery (filled in from dashboard) ─────────────────────────────
    recoveredEgp: { type: Number, default: 0 },
    recoveredUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('RefundRecord', refundRecordSchema);
