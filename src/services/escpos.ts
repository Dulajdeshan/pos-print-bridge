import { MonoBitmap } from "./raster.service";

const ESC = 0x1b;
const GS = 0x1d;

// Rows per GS v 0 command. Printers buffer a whole command before printing,
// so modest bands keep memory use low on cheap models.
const BAND_ROWS = 256;

export interface EscPosJobOptions {
  copies?: number;
  cut?: boolean; // Feed to the cutter and partial-cut after each copy (default: true)
}

/**
 * Encodes a bitmap as an ESC/POS raster job. The receipt is one continuous
 * image, so its length is limited only by the paper roll.
 */
export function encodeRasterJob(
  bitmap: MonoBitmap,
  options: EscPosJobOptions = {}
): Buffer {
  const copies = Math.max(1, options.copies || 1);
  const cut = options.cut !== false;
  const parts: Buffer[] = [Buffer.from([ESC, 0x40])]; // ESC @ — initialise

  for (let copy = 0; copy < copies; copy++) {
    for (let row = 0; row < bitmap.height; row += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, bitmap.height - row);
      // GS v 0 m xL xH yL yH — xL/xH is the width in bytes, not dots.
      parts.push(
        Buffer.from([
          GS, 0x76, 0x30, 0x00,
          bitmap.bytesPerRow & 0xff, (bitmap.bytesPerRow >> 8) & 0xff,
          rows & 0xff, (rows >> 8) & 0xff,
        ])
      );
      parts.push(
        bitmap.data.subarray(
          row * bitmap.bytesPerRow,
          (row + rows) * bitmap.bytesPerRow
        )
      );
    }

    if (cut) {
      // GS V 66 0 — feed the last line past the cutter, then partial cut.
      parts.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
    }
  }

  return Buffer.concat(parts);
}
