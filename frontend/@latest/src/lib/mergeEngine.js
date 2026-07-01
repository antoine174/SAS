// src/lib/mergeEngine.js
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║       CLIENT-SIDE PDF MERGE & OPTIONAL AUTO-CLEANUP ENGINE      ║
 * ║                                                                  ║
 * ║  Operates on ONE tab at a time (receipts OR documents).          ║
 * ║  Vercel serverless 4.5 MB limit is bypassed entirely because     ║
 * ║  all PDF work happens inside the browser's memory via pdf-lib.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { PDFDocument } from 'pdf-lib';
import { supabase, BUCKET } from './supabase';
import { RECEIPTS, DOCUMENTS } from './fileDefinitions';

import { fetchApi } from './api';

// ─── Tab config map ───────────────────────────────────────────────────────────
const TAB_CONFIG = {
  receipts: { defs: RECEIPTS, label: 'ايصالات' },
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Exported function ────────────────────────────────────────────────────────

/**
 * mergeAndDownload
 *
 * Validates, fetches, and merges PDFs for the **active tab only**.
 *
 * Steps:
 *   1. Check all mandatory files for `activeTab` are present.
 *   2. Build ordered merge list (skip missing optionals).
 *   3. Fetch each PDF and merge pages into a master PDF via pdf-lib.
 *   4. Trigger a client-side browser download.
 *   5. [withCleanup only] Delete the tab's files from Supabase storage.
 *   6. [withCleanup only] PATCH the backend to null the tab's URL fields in MongoDB.
 *
 * @param {object}   consignment   – full MongoDB document from React state
 * @param {string}   activeTab     – 'receipts' | 'documents'
 * @param {boolean}  withCleanup   – if true, delete files after download
 * @param {function} onProgress    – callback(message: string) shown in the progress bar
 * @param {function} onError       – callback(message: string) shown as a toast error
 * @param {string}   [password]    – deletion password required when withCleanup = true
 *
 * @returns {Promise<object|false>}
 *   On success with cleanup: returns { clearedTab, clearedState, fullyDeleted }.
 *     fullyDeleted = true  → entire MongoDB record was hard-deleted (unlock the UI).
 *     fullyDeleted = false → only this tab was cleared (keep locked view, clear URLs).
 *   On success without cleanup: returns true.
 *   On validation failure or wrong password: returns false (or throws with isUnauthorized).
 */
export async function mergeAndDownload(
  consignment,
  activeTab,
  withCleanup,
  onProgress,
  onError,
  password,
) {
  const { _id: id, acid } = consignment;
  const tabData = consignment[activeTab] ?? {};
  const currentTabConfig = TAB_CONFIG[activeTab] || {};
  const { defs = [], label = 'ملف' } = currentTabConfig;

  // ── Step 1: Validate mandatory files for this tab ──────────────────────────
  const missingMandatory = defs
    .filter((def) => def.mandatory && !tabData[def.key])
    .map((def) => def.label);

  if (missingMandatory.length > 0) {
    onError?.(`المستندات الإلزامية التالية مفقودة:\n${missingMandatory.join(' | ')}`);
    return false;
  }

  // ── Step 2: Build ordered merge list ──────────────────────────────────────
  // Strict order = definition array order; missing optionals are simply skipped.
  const mergeList = defs
    .filter((def) => !!tabData[def.key])
    .map((def) => ({
      url: tabData[def.key],
      label: def.label,
      key: def.key,
      storagePath: `${id}/${def.key}.pdf`,
    }));

  if (mergeList.length === 0) {
    onError?.('لا توجد ملفات لدمجها.');
    return false;
  }

  // ── Step 3: Fetch & merge ──────────────────────────────────────────────────
  // ── Step 3: Fetch & merge PDFs ─────────────────────────────────────────────
  onProgress?.(`جارٍ تحميل ${mergeList.length} ملف…`);

  const masterPdf = await PDFDocument.create();

  for (const item of mergeList) {
    try {
      // Changed: Now passing item.storagePath instead of item.url
      const bytes = await fetchPdfBytes(item.storagePath);
      const srcPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pageIdxs = srcPdf.getPageIndices();
      const copied = await masterPdf.copyPages(srcPdf, pageIdxs);
      copied.forEach((page) => masterPdf.addPage(page));
    } catch (err) {
      console.error(`⚠️ Could not load PDF for "${item.label}":`, err);
    }
  }
  onProgress?.('جارٍ إنشاء الملف المدموج…');
  const masterBytes = await masterPdf.save();

  // ── Step 4: Download ───────────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${label}_شحنة_${acid || id}_${date}.pdf`;
  downloadBlob(masterBytes, filename);
  onProgress?.('تم تحميل الملف بنجاح ✅');

  // ── Steps 5 & 6: Cleanup (only when withCleanup = true) ───────────────────
  if (!withCleanup) return true;

  // 5. Delete files from Supabase storage
  try {
    const paths = mergeList.map((item) => item.storagePath);
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);

    if (removeError) {
      console.error('Supabase removal error:', removeError);
      // Non-fatal: continue to DB cleanup
    }
  } catch (err) {
    console.error('Storage cleanup error:', err);
  }

  // 6. Null this tab's URL fields in MongoDB (backend may hard-delete if both tabs are empty)
  let fullyDeleted = false;
  try {
    const data = await fetchApi(`/api/consignments/${id}/cleanup`, {
      method: 'PATCH',
      body: JSON.stringify({ tab: activeTab, password }),
    });
    fullyDeleted = data.deleted === true;
  } catch (err) {
    if (err.message.includes('رمز التأكيد')) {
      const customErr = new Error(err.message);
      customErr.isUnauthorized = true;
      throw customErr;
    }
    console.error('Backend cleanup error:', err);
  }

  // Build the cleared tab state so the caller can reset React state immediately
  // without needing a round-trip GET to the server.
  const clearedTabState = {};
  defs.forEach((def) => { clearedTabState[def.key] = null; });

  return { clearedTab: activeTab, clearedState: clearedTabState, fullyDeleted };
}
