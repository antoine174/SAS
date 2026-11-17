// src/lib/pdfCompressor.js
/**
 * Client-Side PDF Compressor
 *
 * Cloudinary's free tier rejects files > 10 MB.  CamScanner produces
 * rasterised PDFs that pdf-lib alone cannot re-compress.
 *
 * Strategy (triggered when file > 9.5 MB):
 *   1. Render every page to an OffscreenCanvas at 1.5× scale via pdfjs-dist.
 *   2. Export each canvas as a JPEG (quality: 0.65).
 *   3. Re-assemble the JPEG pages into a brand-new pdf-lib document.
 *
 * Result: a visually similar PDF well below the 10 MB upload limit.
 */

import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs web-worker (CDN matches the installed version)
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const SIZE_THRESHOLD = 9.5 * 1024 * 1024; // 9.5 MB
const RENDER_SCALE = 1.5;
const JPEG_QUALITY = 0.65;

/**
 * Create a canvas compatible with both main-thread and worker contexts.
 */
function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  // Fallback for older browsers
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Export a canvas to JPEG bytes.
 * @returns {Promise<Uint8Array>}
 */
async function canvasToJpegBytes(canvas, quality) {
  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return new Uint8Array(await blob.arrayBuffer());
  }
  // Fallback: HTMLCanvasElement
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas toBlob returned null'));
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Compress a PDF if it exceeds SIZE_THRESHOLD.
 * Returns the original File untouched when compression is not needed.
 *
 * @param {File} file  – the PDF file (from input or IndexedDB)
 * @returns {Promise<File>}
 */
export async function compressPdfIfNeeded(file) {
  if (file.size <= SIZE_THRESHOLD) return file;

  console.log(`[compressor] File ${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — compressing…`);

  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const numPages = srcDoc.numPages;

  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    const page = await srcDoc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    );
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const jpegBytes = await canvasToJpegBytes(canvas, JPEG_QUALITY);
    const jpegImage = await newPdf.embedJpg(jpegBytes);

    // Page dimensions match the rendered canvas size (in PDF points)
    const newPage = newPdf.addPage([viewport.width, viewport.height]);
    newPage.drawImage(jpegImage, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
  }

  const compressedBytes = await newPdf.save();
  const compressedFile = new File([compressedBytes], file.name, { type: 'application/pdf' });

  console.log(
    `[compressor] Done — ${numPages} pages, `
    + `${(file.size / 1024 / 1024).toFixed(1)} MB → ${(compressedFile.size / 1024 / 1024).toFixed(1)} MB`,
  );

  return compressedFile;
}
