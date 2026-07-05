// src/lib/mergeEngine.js
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║       CLIENT-SIDE PDF MERGE & OPTIONAL AUTO-CLEANUP ENGINE      ║
 * ║                                                                  ║
 * ║  Operates on ONE tab at a time (receipts OR documents).          ║
 * ║  Vercel serverless 4.5 MB limit is bypassed entirely because     ║
 * ║  all PDF work happens inside the browser's memory via pdf-lib.   ║
 * ║                                                                  ║
 * ║  Merge sequence logic:                                           ║
 * ║    For each base def in order:                                   ║
 * ║      1. Include the base slot (if uploaded)                      ║
 * ║      2. Include all dynamic copies of this type in index order   ║
 * ║    Missing slots are simply skipped — no validation errors.      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { PDFDocument } from 'pdf-lib';
import { supabase, BUCKET } from './supabase';
import { RECEIPTS, DOCUMENTS } from './fileDefinitions';
import { fetchApi } from './api';

// ─── Tab config map ───────────────────────────────────────────────────────────
const TAB_CONFIG = {
  receipts:  { defs: RECEIPTS,  label: 'ايصالات' },
  documents: { defs: DOCUMENTS, label: 'مستندات' },
};

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Fetch a PDF using the Supabase SDK to bypass CORS issues.
 * @param {string} storagePath
 * @returns {Promise<ArrayBuffer>}
 */
async function fetchPdfBytes(storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error) {
    throw new Error(`Supabase Download Error: ${error.message}`);
  }

  return await data.arrayBuffer();
}

/**
 * Trigger a browser download for a Uint8Array PDF.
 * @param {Uint8Array} pdfBytes
 * @param {string}     filename
 */
function downloadBlob(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * buildMergeList
 *
 * Constructs the ordered list of files to merge by interleaving dynamic copies
 * immediately after their base type, respecting the canonical sequence.
 *
 * Example output for invoice with 2 extras:
 *   الأول الافراج → ملحق ٤ → الفاتوره(base) → الفاتوره 1 → الفاتوره 2 → البيان → …
 *
 * @param {string}   consignmentId  – MongoDB _id (used to build Supabase paths)
 * @param {object}   tabData        – e.g. consignment.documents
 * @param {Array}    baseDefs       – e.g. DOCUMENTS
 * @param {Array}    dynamicFields  – e.g. [{ key:'invoice_1', baseKey:'invoice', label:'الفاتوره 1' }]
 * @returns {Array<{ key, label, storagePath }>}
 */
function buildMergeList(consignmentId, tabData, baseDefs, dynamicFields) {
  const list = [];

  for (const def of baseDefs) {
    // 1. Base slot
    if (tabData[def.key]) {
      list.push({
        key:         def.key,
        label:       def.label,
        storagePath: `${consignmentId}/${def.key}.pdf`,
      });
    }

    // 2. Dynamic copies of this type, sorted by numeric index
    const copies = (dynamicFields || [])
      .filter((f) => f.baseKey === def.key)
      .sort((a, b) => {
        const idxA = parseInt(a.key.split('_').pop(), 10) || 0;
        const idxB = parseInt(b.key.split('_').pop(), 10) || 0;
        return idxA - idxB;
      });

    for (const copy of copies) {
      if (tabData[copy.key]) {
        list.push({
          key:         copy.key,
          label:       copy.label,
          storagePath: `${consignmentId}/${copy.key}.pdf`,
        });
      }
    }
  }

  return list;
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * mergeAndDownload
 *
 * Fetches and merges PDFs for the active tab into a single PDF, then downloads it.
 * All files are optional — missing slots are silently skipped.
 *
 * Steps:
 *   1. Build ordered merge list (base order with dynamics interleaved).
 *   2. Fetch each PDF and merge pages into a master PDF via pdf-lib.
 *   3. Trigger a client-side browser download.
 *   4. [withCleanup only] Delete the tab's files from Supabase storage.
 *   5. [withCleanup only] PATCH the backend to wipe the tab's sub-document in MongoDB.
 *
 * @param {object}   consignment   – full MongoDB document from React state
 * @param {string}   activeTab     – 'receipts' | 'documents'
 * @param {boolean}  withCleanup   – if true, delete files after download
 * @param {function} onProgress    – callback(message: string) shown in the progress bar
 * @param {function} onError       – callback(message: string) shown as a toast error
 * @param {string}   [password]    – deletion password required when withCleanup = true
 * @param {Array}    [dynamicFields] – current dynamic field state for this tab
 *
 * @returns {Promise<object|boolean>}
 */
export async function mergeAndDownload(
  consignment,
  activeTab,
  withCleanup,
  onProgress,
  onError,
  password,
  dynamicFields = [],
) {
  const { _id: id, acid } = consignment;
  const tabData           = consignment[activeTab] ?? {};
  const currentTabConfig  = TAB_CONFIG[activeTab] || {};
  const { defs = [], label = 'ملف' } = currentTabConfig;

  // ── Step 1: Build ordered merge list ────────────────────────────────────────
  const mergeList = buildMergeList(id, tabData, defs, dynamicFields);

  if (mergeList.length === 0) {
    onError?.('لا توجد ملفات مرفوعة لدمجها في هذا التبويب.');
    return false;
  }

  // ── Step 2: Fetch & merge PDFs ───────────────────────────────────────────────
  onProgress?.(`جارٍ تحميل ${mergeList.length} ملف…`);

  const masterPdf = await PDFDocument.create();

  for (const item of mergeList) {
    try {
      const bytes  = await fetchPdfBytes(item.storagePath);
      const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await masterPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copied.forEach((page) => masterPdf.addPage(page));
    } catch (err) {
      // Non-fatal: skip this file and continue merging the rest
      console.warn(`⚠️ Could not load PDF for "${item.label}" (${item.key}):`, err.message);
    }
  }

  onProgress?.('جارٍ إنشاء الملف المدموج…');
  const masterBytes = await masterPdf.save();

  // ── Build filename per company naming convention ──────────────────────────
  // Format: {fileNumber}-{year} {count} {supplierName} {certificateNumber} {itemName} - {arrivalPort} {tabName}.pdf
  const _fileNum  = consignment.fileNumber
    ? String(consignment.fileNumber).padStart(4, '0')
    : 'رقم الملف';
  const _year     = consignment.createdAt
    ? new Date(consignment.createdAt).getFullYear()
    : new Date().getFullYear();
  const _count    = consignment.count             || 'العدد';
  const _supplier = consignment.supplierName      || 'اسم المورد';
  const _certNum  = consignment.certificateNumber || 'رقم الشهاده';
  const _item     = consignment.itemName          || 'اسم الصنف';
  const _port     = consignment.arrivalPort       || 'ميناء الوصول';
  const _tabName  = activeTab === 'documents'     ? 'مستندات' : 'ايصالات';

  const filename = `${_fileNum}-${_year} ${_count} ${_supplier} ${_certNum} ${_port} - ${_item} ${_tabName}.pdf`;

  downloadBlob(masterBytes, filename);
  onProgress?.('تم تحميل الملف بنجاح ✅');

  // ── Steps 4 & 5: Cleanup (only when withCleanup = true) ─────────────────────
  if (!withCleanup) return true;

  // 4. Delete files from Supabase storage
  try {
    const paths = mergeList.map((item) => item.storagePath);
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) console.warn('Supabase removal error:', removeError.message);
  } catch (err) {
    console.warn('Storage cleanup error (non-fatal):', err.message);
  }

  // 5. Wipe the tab's sub-document in MongoDB
  let fullyDeleted = false;
  try {
    const data = await fetchApi(`/api/consignments/${id}/cleanup`, {
      method: 'PATCH',
      body: JSON.stringify({ tab: activeTab, password }),
    });
    fullyDeleted = data.deleted === true;
  } catch (err) {
    if (err.message.includes('رمز التأكيد')) {
      const customErr    = new Error(err.message);
      customErr.isUnauthorized = true;
      throw customErr;
    }
    console.warn('Backend cleanup error (non-fatal):', err.message);
  }

  // Build the cleared tab state so the caller can reset React state immediately
  const clearedTabState = {};
  defs.forEach((def) => { clearedTabState[def.key] = null; });
  dynamicFields.forEach((f) => { clearedTabState[f.key] = null; });

  return { clearedTab: activeTab, clearedState: clearedTabState, fullyDeleted };
}
