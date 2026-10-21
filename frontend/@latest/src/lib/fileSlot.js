// src/lib/fileSlot.js
/**
 * File-slot helpers.
 *
 * A slot (consignment.documents[key] / consignment.receipts[key]) is either:
 *   - NEW:    { url, uploadedBy, uploadedById, uploadedAt }
 *   - LEGACY: a plain string URL
 *   - EMPTY:  null / undefined
 * Always read slots through these helpers so legacy records never crash the UI.
 */
import { DOCUMENTS, RECEIPTS } from './fileDefinitions';

export const UNKNOWN_UPLOADER = 'مستخدم غير معروف';

export function getSlotUrl(slot) {
  if (!slot) return null;
  if (typeof slot === 'string') return slot;
  if (typeof slot === 'object' && typeof slot.url === 'string' && slot.url) return slot.url;
  return null;
}

/** Returns null for an empty slot, otherwise { url, uploadedBy, uploadedAt, known }. */
export function getSlotMeta(slot) {
  const url = getSlotUrl(slot);
  if (!url) return null;
  const by = typeof slot === 'object' ? slot.uploadedBy : null;
  return {
    url,
    uploadedBy: by || UNKNOWN_UPLOADER,
    uploadedAt: (typeof slot === 'object' && slot.uploadedAt) || null,
    known: !!by,
  };
}

export function formatUploadDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ar-EG', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const TAB_DEFS = {
  documents: { label: 'المستندات', defs: DOCUMENTS },
  receipts: { label: 'الايصالات', defs: RECEIPTS },
};

/**
 * Flat, display-ordered list of every uploaded file in a consignment:
 *   [{ tab, tabLabel, key, label, url, uploadedBy, uploadedAt, known }]
 * Order follows the canonical definitions; dynamic copies (key_N) follow their base.
 */
export function listUploadedFiles(doc) {
  const out = [];
  for (const [tab, { label: tabLabel, defs }] of Object.entries(TAB_DEFS)) {
    const data = (doc && doc[tab]) || {};
    if (typeof data !== 'object') continue;

    defs.forEach((def) => {
      const keys = [def.key];
      Object.keys(data)
        .map((k) => k.match(/^(.+)_(\d+)$/))
        .filter((m) => m && m[1] === def.key)
        .sort((a, b) => Number(a[2]) - Number(b[2]))
        .forEach((m) => keys.push(m[0]));

      keys.forEach((key) => {
        const meta = getSlotMeta(data[key]);
        if (!meta) return;
        const m = key.match(/^(.+)_(\d+)$/);
        out.push({
          tab,
          tabLabel,
          key,
          label: m && m[1] === def.key ? `${def.label} ${m[2]}` : def.label,
          ...meta,
        });
      });
    });
  }
  return out;
}
