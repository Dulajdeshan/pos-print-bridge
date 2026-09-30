import { BrowserWindow, NativeImage, screen } from "electron";

/** 1-bit image, rows packed MSB-first, 1 = black dot. */
export interface MonoBitmap {
  width: number;
  height: number;
  bytesPerRow: number;
  data: Buffer;
}

export interface RasterOptions {
  contentWidthMm: number; // Width the HTML was laid out for
  dotsWidth: number; // Printer dots per line (e.g. 576 for 80mm @ 203dpi)
  dither?: boolean; // Floyd–Steinberg instead of a hard threshold
}

// Height of each capture, in device pixels. Receipts are captured in slices
// so their length is unbounded by window or GPU texture size limits.
const SLICE_HEIGHT = 1000;
const THRESHOLD = 150;

const MM_TO_CSS_PX = 96 / 25.4;

export async function renderHtmlToBitmap(
  html: string,
  options: RasterOptions
): Promise<MonoBitmap> {
  const { dotsWidth } = options;
  const cssWidth = options.contentWidthMm * MM_TO_CSS_PX;

  // Zoom so the paper width in CSS px lands exactly on the printer's dot
  // width: text is rendered at print resolution instead of being upscaled.
  // Offscreen rendering also applies the display's scaling (e.g. 125%) to the
  // window size and zoom, so divide it out up front — changing the zoom after
  // load applies asynchronously and would skew the measurements.
  const displayScale = screen.getPrimaryDisplay().scaleFactor || 1;
  const win = new BrowserWindow({
    show: false,
    width: Math.ceil(dotsWidth / displayScale),
    height: Math.round(SLICE_HEIGHT / displayScale),
    useContentSize: true,
    enableLargerThanScreen: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      offscreen: true,
      zoomFactor: dotsWidth / cssWidth / displayScale,
      // A hidden window is otherwise throttled to ~1 frame per second,
      // which stalls every slice capture.
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.insertCSS(
      "html, body { background: #fff !important; overflow: hidden !important; }" +
        " ::-webkit-scrollbar { display: none; }"
    );

    const metrics: { height: number; dpr: number; vh: number } =
      await win.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) =>
          img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })
        ));
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return {
          height: Math.ceil(document.documentElement.scrollHeight),
          dpr: window.devicePixelRatio,
          vh: window.innerHeight,
        };
      })()`);

    let gray: Uint8Array | null = null;
    let totalRows = 0;
    let dotsPerCssPx = 0;

    for (let y = 0; y < metrics.height; y += metrics.vh) {
      // Shift the content up instead of scrolling: no clamping at the end of
      // the page, so every slice maps to the same fixed offset.
      await win.webContents.executeJavaScript(`new Promise((resolve) => {
        document.body.style.transform = "translateY(-${y}px)";
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })`);

      let image: NativeImage = await win.webContents.capturePage();
      const size = image.getSize();
      let scale = 1;
      if (size.width > dotsWidth && size.width <= dotsWidth + 2) {
        // Rounding of the window width can leave a spare column or two.
        image = image.crop({ x: 0, y: 0, width: dotsWidth, height: size.height });
      } else if (size.width !== dotsWidth) {
        // Fallback if the display scale guess was off: resample to fit.
        scale = dotsWidth / size.width;
        image = image.resize({ width: dotsWidth, quality: "best" });
      }

      if (!gray) {
        // Printer dots per CSS px, as actually captured.
        dotsPerCssPx = metrics.dpr * scale;
        totalRows = Math.ceil(metrics.height * dotsPerCssPx);
        gray = new Uint8Array(dotsWidth * totalRows).fill(255);
      }

      const rowStart = Math.round(y * dotsPerCssPx);
      const rowEnd = Math.min(
        totalRows,
        Math.round((y + metrics.vh) * dotsPerCssPx),
        rowStart + image.getSize().height
      );
      copyGrayRows(image, gray, dotsWidth, rowStart, rowEnd);
    }

    if (!gray) {
      throw new Error("Document rendered with no content");
    }
    return packBitmap(gray, dotsWidth, totalRows, options.dither === true);
  } finally {
    win.destroy();
  }
}

function copyGrayRows(
  image: NativeImage,
  gray: Uint8Array,
  width: number,
  rowStart: number,
  rowEnd: number
) {
  // BGRA; transparent pixels are treated as white paper.
  const bgra = image.toBitmap();
  for (let row = rowStart; row < rowEnd; row++) {
    const src = (row - rowStart) * width * 4;
    const dst = row * width;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      const alpha = bgra[i + 3] / 255;
      const lum = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2];
      gray[dst + x] = lum * alpha + 255 * (1 - alpha);
    }
  }
}

function packBitmap(
  gray: Uint8Array,
  width: number,
  height: number,
  dither: boolean
): MonoBitmap {
  const bytesPerRow = Math.ceil(width / 8);
  const data = Buffer.alloc(bytesPerRow * height);
  // Error diffusion needs signed headroom beyond 0..255.
  const levels = dither ? Float32Array.from(gray) : gray;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const black = levels[i] < (dither ? 128 : THRESHOLD);
      if (black) {
        data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }

      if (dither) {
        const err = levels[i] - (black ? 0 : 255);
        if (x + 1 < width) levels[i + 1] += (err * 7) / 16;
        if (y + 1 < height) {
          if (x > 0) levels[i + width - 1] += (err * 3) / 16;
          levels[i + width] += (err * 5) / 16;
          if (x + 1 < width) levels[i + width + 1] += err / 16;
        }
      }
    }
  }

  return { width, height, bytesPerRow, data };
}
