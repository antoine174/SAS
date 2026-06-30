const mongoose = require('mongoose');

/**
 * Consignment Schema
 *
 * Tracks one shipment cell identified by containerName + billId + companyName.
 * Every document slot stores a public Supabase URL (string) or null.
 *
 * English key → Arabic UI label mapping is documented inline.
 * Merge order = array index order within each tab group.
 */

// ─── Tab 1: Receipts (ايصالات) ────────────────────────────────────────────────
const receiptsSchema = new mongoose.Schema({
  currentAccount:      { type: String, default: null }, // حساب جاري       – Mandatory
  cps:                 { type: String, default: null }, // CPS              – Mandatory
  freightInvoice:      { type: String, default: null }, // فاتوره نولون     – Mandatory
  freightReceipt:      { type: String, default: null }, // ايصال نولون      – Mandatory
  unloadingReceipt:    { type: String, default: null }, // ايصال تفريغ      – Mandatory
  unloadingInvoice:    { type: String, default: null }, // فاتوره تفريغ     – Mandatory
  guardReceipt:        { type: String, default: null }, // ايصال الحراسه    – Optional
  guardInvoice:        { type: String, default: null }, // فاتوره حراسه     – Optional
  fineReceipt:         { type: String, default: null }, // ايصال غرامه      – Optional
  fineInvoice:         { type: String, default: null }, // فاتوره غرامه     – Optional
  weightReceipt:       { type: String, default: null }, // ايصال وزن        – Mandatory
  analysisReceipt:     { type: String, default: null }, // ايصال تحليل      – Optional
}, { _id: false });

// ─── Tab 2: Documents (مستندات) ───────────────────────────────────────────────
const documentsSchema = new mongoose.Schema({
  firstRelease:        { type: String, default: null }, // الأول الافراج    – Mandatory
  appendix4:           { type: String, default: null }, // ملحق ٤           – Mandatory
  invoice:             { type: String, default: null }, // الفاتوره         – Mandatory
  declaration:         { type: String, default: null }, // البيان           – Mandatory
  insurance:           { type: String, default: null }, // التامين          – Mandatory
  houseBillOfLading:   { type: String, default: null }, // البوليصه هاوس   – Optional
  masterBillOfLading:  { type: String, default: null }, // البوليصه ماستر  – Mandatory
  permission:          { type: String, default: null }, // الاذن            – Mandatory
  euro1:               { type: String, default: null }, // يوروا ١          – Optional
  analysis:            { type: String, default: null }, // تحليل            – Optional
}, { _id: false });

// ─── Root Schema ──────────────────────────────────────────────────────────────
const consignmentSchema = new mongoose.Schema({
  containerName: { type: String, required: true, trim: true },
  billId:        { type: String, required: true, trim: true, index: true },
  companyName:   { type: String, required: true, trim: true },

  // Nested document groups
  receipts:   { type: receiptsSchema,  default: () => ({}) },
  documents:  { type: documentsSchema, default: () => ({}) },

  // No status field – consignments remain permanently active
  // and can be searched, updated, or appended to at any time.
}, {
  timestamps: true, // adds createdAt / updatedAt
});

// Compound unique index: one record per container per bill per company
// (allows multiple containers under the same bill)
consignmentSchema.index({ containerName: 1, billId: 1, companyName: 1 }, { unique: true });

module.exports = mongoose.model('Consignment', consignmentSchema);
