const mongoose = require('mongoose');

/**
 * FILE SLOTS  (documents.<key> and receipts.<key>)
 *
 * New uploads are stored as flexible objects:
 *   { url, uploadedBy, uploadedById, uploadedAt }
 *     url          – Cloudinary secure URL (String)
 *     uploadedBy   – uploader's username  (String)  ← stamped server-side from the verified JWT
 *     uploadedById – uploader's User _id  (ObjectId)
 *     uploadedAt   – upload timestamp     (Date)
 *
 * BACKWARD COMPATIBILITY: legacy records hold a plain string URL (or null when empty).
 * `documents` / `receipts` stay `Mixed`, so both shapes load without migration.
 * Always read a slot through getSlotUrl() — never assume it is a string.
 */
function getSlotUrl(slot) {
  if (!slot) return null;
  if (typeof slot === 'string') return slot;                         // legacy shape
  if (typeof slot === 'object' && typeof slot.url === 'string' && slot.url) return slot.url;
  return null;
}

function buildFileSlot(url, user) {
  return {
    url,
    uploadedBy: user?.username || null,
    uploadedById: user?._id && mongoose.Types.ObjectId.isValid(user._id)
      ? new mongoose.Types.ObjectId(user._id)
      : null,
    uploadedAt: new Date(),
  };
}

const consignmentSchema = new mongoose.Schema({
  companyName:           { type: String, enum: ['مصانع الترياق', 'شركة الزامل', 'شركة الزامل للهياكل الفولاذية', 'شركة الزامل للمباني الحديدية', 'مصنع الصفوة للصناعات البلاستيكية', 'بافت للتصنيع و التنمية'], required: true },
  acid:                  { type: String, lowercase: true, required: true, unique: true },
  invoiceSequenceNumber: { type: String, lowercase: true },
  consignmentNumber:     { type: String, lowercase: true },
  itemName:              { type: String, lowercase: true },
  count:                 { type: String },
  supplierName:          { type: String, lowercase: true },
  certificateNumber:     { type: String },          // رقم الشهاده (optional)
  arrivalPort:           { type: String },          // ميناء الوصول (optional)
  fileNumber:            { type: String },          // رقم الملف (optional)
  receipts:              { type: mongoose.Schema.Types.Mixed, default: {} },
  documents:             { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true }); 

// Safe pre-save hook (Fixed for Mongoose 9 - must be async function without 'next' parameter)
consignmentSchema.pre('save', async function() {
  if (this.count && typeof this.count === 'string') {
    this.count = this.count.replace(/\s+/g, '').replace(/X|\*/gi, 'x');
  }
});

const Consignment = mongoose.model('Consignment', consignmentSchema);
Consignment.getSlotUrl = getSlotUrl;
Consignment.buildFileSlot = buildFileSlot;

module.exports = Consignment;
