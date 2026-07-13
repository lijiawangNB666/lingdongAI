/*
 * pdf-parse-lib v1.0.0 — Lightweight PDF text/image extractor for Electron
 * Compatible with Node.js 18+ and Electron 41+
 * Uses pdfjs-dist (minimal bundle) + canvas fallback
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Load pdfjs-dist from bundled lib (avoid CDN/network)
let pdfjsLib;
try {
  pdfjsLib = require('./libs/pdfjs-dist/build/pdf.js');
} catch (e) {
  // Fallback: try global if not bundled
  try {
    pdfjsLib = require('pdfjs-dist');
  } catch (e2) {
    throw new Error('pdfjs-dist not found. Please install: npm install pdfjs-dist --save');
  }
}

// Set workerSrc to embedded worker (critical for Electron)
pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs-dist/build/pdf.worker.mjs';

/**
 * Parse PDF buffer to extract text + first page image (for multimodal AI)
 * @param {Buffer} pdfBuffer
 * @param {Object} options
 * @returns {Promise<{text: string, images: Buffer[], metadata: Object}>}
 */
async function parsePdf(pdfBuffer, options = {}) {
  const { maxPages = 10, extractImages = true, maxWidth = 800 } = options;
  
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBuffer,
    disableFontFace: true,
    cMapUrl: './libs/pdfjs-dist/cmaps/',
    cMapPacked: true
  });

  const doc = await loadingTask.promise;
  const metadata = await doc.getMetadata();
  let fullText = '';
  const images = [];

  // Process pages
  for (let i = 0; i < Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i + 1);
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map(item => item.str).filter(str => str.trim());
    fullText += textItems.join(' ') + '\n\n';

    // Extract first page as image (for Qwen-VL)
    if (extractImages && images.length === 0) {
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      
      await page.render({
        canvasContext: ctx,
        viewport
      }).promise;
      
      // Resize to maxWidth if needed
      if (viewport.width > maxWidth) {
        const scale = maxWidth / viewport.width;
        const scaledCanvas = createCanvas(Math.round(viewport.width * scale), Math.round(viewport.height * scale));
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        images.push(scaledCanvas.toBuffer('image/png'));
      } else {
        images.push(canvas.toBuffer('image/png'));
      }
    }
  }

  return {
    text: fullText.trim(),
    images,
    metadata: {
      title: metadata.info?.Title || 'Untitled PDF',
      author: metadata.info?.Author || '',
      pages: doc.numPages
    }
  };
}

module.exports = { parsePdf };