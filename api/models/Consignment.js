const mongoose = require('mongoose');

const consignmentSchema = new mongoose.Schema({
  companyName:           { type: String, enum: ['مصانع الترياق', 'شركة الزامل'], required: true },
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

module.exports = mongoose.model('Consignment', consignmentSchema);
