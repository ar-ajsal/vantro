let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('[normalizeImage] sharp not installed or failed to load. Image normalization will be skipped.', e.message);
}

const CANVAS_SIZE = 1000;       // Final output: 1000x1000 px
const MAX_PRODUCT_DIM = 800;    // Product fits within 800x800 (80% of canvas)

/**
 * Normalizes a transparent PNG from remove.bg:
 *   1. Trims all transparent whitespace (alpha-aware)
 *   2. Resizes proportionally to fit inside MAX_PRODUCT_DIM x MAX_PRODUCT_DIM
 *      - Wide product  → width drives scaling
 *      - Tall product  → height drives scaling
 *      - Aspect ratio always preserved, product never cropped
 *   3. Places product centered on a CANVAS_SIZE x CANVAS_SIZE transparent canvas
 *
 * @param {Buffer} pngBuffer - Transparent PNG buffer (from remove.bg)
 * @returns {Promise<Buffer>} - Normalized 1000x1000 transparent PNG buffer
 */
async function normalizeProductImage(pngBuffer) {
  if (!sharp) {
    return pngBuffer;
  }
  // Step 1: Trim all transparent margins around the actual product
  const trimmedBuffer = await sharp(pngBuffer)
    .trim({ threshold: 10 })   // threshold=10 handles near-transparent anti-aliased edges
    .toBuffer();

  // Step 2: Resize to fit inside 800x800, preserving aspect ratio
  const resizedBuffer = await sharp(trimmedBuffer)
    .resize({
      width: MAX_PRODUCT_DIM,
      height: MAX_PRODUCT_DIM,
      fit: 'inside',           // Never crop, never distort
      withoutEnlargement: false, // Allow upscaling small products to fill the area
    })
    .toBuffer();

  // Step 3: Get exact post-resize dimensions for pixel-perfect centering
  const { width: rw, height: rh } = await sharp(resizedBuffer).metadata();
  const left = Math.round((CANVAS_SIZE - rw) / 2);
  const top  = Math.round((CANVAS_SIZE - rh) / 2);

  // Step 4: Composite centered product onto transparent 1000x1000 canvas
  const finalBuffer = await sharp({
    create: {
      width:      CANVAS_SIZE,
      height:     CANVAS_SIZE,
      channels:   4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // fully transparent
    },
  })
  .composite([{ input: resizedBuffer, left, top }])
  .png({ compressionLevel: 8 }) // good compression, lossless transparency
  .toBuffer();

  return finalBuffer;
}

module.exports = { normalizeProductImage };
