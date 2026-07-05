// src/lib/fileDefinitions.js
/**
 * Central source of truth for all document/receipt fields.
 *
 * Each entry:
 *   key   – matches the MongoDB field key (English, camelCase)
 *   label – Arabic UI label shown to the user
 *
 * ORDER IN EACH ARRAY = strict PDF merge order.
 * All fields are optional — the merge engine skips missing files gracefully.
 */

export const DOCUMENTS = [
  { key: 'firstRelease', label: 'الأول الافراج' },
  { key: 'appendix4', label: 'ملحق ٤' },
  { key: 'invoice', label: 'الفاتوره' },
  { key: 'declaration', label: 'البيان' },
  { key: 'euro1', label: 'يوروا ١' },
  { key: 'originCertificate', label: 'شهاده المنشأ' },
  { key: 'insurance', label: 'التامين' },
  { key: 'houseBillOfLading', label: 'البوليصه هاوس' },
  { key: 'masterBillOfLading', label: 'البوليصه ماستر' },
  { key: 'permission', label: 'الاذن' },
  { key: 'analysis', label: 'تحليل' },
  { key: 'generalSecurity', label: 'امن عام' },
];

export const RECEIPTS = [
  { key: 'currentAccount', label: 'حساب جاري' },
  { key: 'cps', label: 'CPS' },
  { key: 'assignmentReceipt', label: 'ايصال تنازل' },
  { key: 'assignmentInvoice', label: 'فاتوره تنازل' },
  { key: 'freightInvoice', label: 'فاتوره نولون' },
  { key: 'freightReceipt', label: 'ايصال نولون' },
  { key: 'unloadingReceipt', label: 'ايصال تفريغ' },
  { key: 'unloadingInvoice', label: 'فاتوره تفريغ' },
  { key: 'guardReceipt', label: 'ايصال الحراسه' },
  { key: 'guardInvoice', label: 'فاتوره حراسه' },
  { key: 'fineReceipt', label: 'ايصال غرامه' },
  { key: 'fineInvoice', label: 'فاتوره غرامه' },
  { key: 'weightReceipt', label: 'ايصال وزن' },
  { key: 'analysisReceipt', label: 'ايصال تحليل' },
  { key: 'portAuthorityReceipt', label: 'ايصال هيئه ميناء' },
  { key: 'overweightReceipt', label: 'ايصال زياده وزن' },
  { key: 'roadReceipt', label: 'ايصال طريق' },
  { key: 'agingReceipt', label: 'ايصال تعتيق' },
  { key: 'carEntryReceipt', label: 'ايصال دخول سيارة' },
  { key: 'carWaitingReceipt', label: 'ايصال انتظار سيارة' },
];
