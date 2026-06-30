// src/lib/fileDefinitions.js
/**
 * Central source of truth for all document/receipt fields.
 *
 * Each entry:
 *   key      – matches the Mongoose schema field (English, camelCase)
 *   label    – Arabic UI label shown to the user
 *   mandatory – if true, merge is blocked when missing
 *
 * ORDER IN EACH ARRAY = strict PDF merge order.
 */

export const RECEIPTS = [
  { key: 'currentAccount',    label: 'حساب جاري',       mandatory: true  },
  { key: 'cps',               label: 'CPS',              mandatory: true  },
  { key: 'freightInvoice',    label: 'فاتورة نولون',     mandatory: true  },
  { key: 'freightReceipt',    label: 'ايصال نولون',      mandatory: true  },
  { key: 'unloadingReceipt',  label: 'ايصال تفريغ',      mandatory: true  },
  { key: 'unloadingInvoice',  label: 'فاتورة تفريغ',     mandatory: true  },
  { key: 'guardReceipt',      label: 'ايصال الحراسة',    mandatory: false },
  { key: 'guardInvoice',      label: 'فاتورة حراسة',     mandatory: false },
  { key: 'fineReceipt',       label: 'ايصال غرامة',      mandatory: false },
  { key: 'fineInvoice',       label: 'فاتورة غرامة',     mandatory: false },
  { key: 'weightReceipt',     label: 'ايصال وزن',        mandatory: true  },
  { key: 'analysisReceipt',   label: 'ايصال تحليل',      mandatory: false },
];

export const DOCUMENTS = [
  { key: 'firstRelease',        label: 'الأول الافراج',    mandatory: true  },
  { key: 'appendix4',           label: 'ملحق ٤',           mandatory: true  },
  { key: 'invoice',             label: 'الفاتورة',          mandatory: true  },
  { key: 'declaration',         label: 'البيان',            mandatory: true  },
  { key: 'insurance',           label: 'التأمين',           mandatory: true  },
  { key: 'houseBillOfLading',   label: 'البوليصة هاوس',    mandatory: false },
  { key: 'masterBillOfLading',  label: 'البوليصة ماستر',   mandatory: true  },
  { key: 'permission',          label: 'الاذن',             mandatory: true  },
  { key: 'euro1',               label: 'يوروا ١',           mandatory: false },
  { key: 'analysis',            label: 'تحليل',             mandatory: false },
];
