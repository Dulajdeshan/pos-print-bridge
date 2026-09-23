import { BrowserWindow } from "electron";
import { PrintDocument, PrintOptions, PaperSize } from "../types/printer.types";
import { HtmlGeneratorService } from "./html-generator.service";
import { PrinterService, printerService } from "./printer.service";

const PAPER_SIZES: Record<PaperSize, number> = {
  "80mm": 80,
  "78mm": 78,
  "76mm": 76,
  "58mm": 58,
  "57mm": 57,
  "44mm": 44,
};

// CSS pixels are 1/96 inch; page sizes are in microns.
const MICRONS_PER_CSS_PX = 25400 / 96;
// Short receipts keep the previous A4-length page so their output is unchanged.
const MIN_PAGE_HEIGHT_MICRONS = 297000;
// Absorbs rounding so the last line never spills onto a second page.
const PAGE_HEIGHT_BUFFER_MICRONS = 5000;

export class PrintService {
  private htmlGenerator: HtmlGeneratorService;
  private printerService: PrinterService;
  private printWindow: BrowserWindow | null = null;
  private printQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.htmlGenerator = new HtmlGeneratorService();
    this.printerService = printerService;
  }

  private getPrintWindow(): BrowserWindow {
    if (!this.printWindow || this.printWindow.isDestroyed()) {
      this.printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      // Keep the window alive between jobs
      this.printWindow.on("close", (e) => {
        e.preventDefault();
      });
    }
    return this.printWindow;
  }

  async printDocument(
    document: PrintDocument,
    options: PrintOptions
  ): Promise<void> {
    // Serialise jobs so the shared window is never used concurrently.
    const job = this.printQueue.then(() =>
      this._printDocument(document, options)
    );
    // Swallow the rejection on the *queue* handle only. Chaining .then() off a
    // rejected promise skips the callback and re-raises the original error, so
    // without this a single failed job would make every later job fail with
    // that same stale error until the app is restarted.
    this.printQueue = job.catch(() => {});
    return job;
  }

  private async _printDocument(
    document: PrintDocument,
    options: PrintOptions
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`Printing to: ${options.printerName}`);
        console.log(`Paper size: ${options.paperSize || "80mm"}`);
        console.log(`Font scale: ${options.fontScale || 1.0}`);

        // Verify printer exists (cached list; re-enumerates only on a miss)
        const printerExists = await this.printerService.verifyPrinter(
          options.printerName
        );
        if (!printerExists) {
          throw new Error(
            `Printer "${options.printerName}" not found in system`
          );
        }

        const printWindow = this.getPrintWindow();

        // Generate HTML
        const html = this.htmlGenerator.generateDocumentHTML(document, options);

        const paperWidth = PAPER_SIZES[options.paperSize || "80mm"];

        // The window is reused across jobs, so both listeners must be torn
        // down once the job settles — otherwise every successful print leaves
        // its did-fail-load handler attached to the shared webContents.
        const cleanup = () => {
          printWindow.webContents.removeListener("did-finish-load", onFinish);
          printWindow.webContents.removeListener("did-fail-load", onFail);
        };

        const onFinish = async () => {
          // Size the page to the rendered content. A fixed height splits long
          // receipts into multiple pages, which thermal drivers can emit out
          // of order (the tail of the receipt printing before the header).
          let pageHeight = MIN_PAGE_HEIGHT_MICRONS;
          try {
            const contentHeightPx: number =
              await printWindow.webContents.executeJavaScript(
                `document.fonts.ready.then(() => Math.ceil(document.documentElement.scrollHeight))`
              );
            pageHeight = Math.max(
              MIN_PAGE_HEIGHT_MICRONS,
              Math.ceil(contentHeightPx * MICRONS_PER_CSS_PX) +
                PAGE_HEIGHT_BUFFER_MICRONS
            );
          } catch (err) {
            console.warn("Could not measure content height:", err);
          }

          printWindow.webContents.print(
            {
              silent: options.silent !== false,
              printBackground: true,
              deviceName: options.printerName,
              copies: options.copies || 1,
              margins: {
                marginType: "none",
              },
              pageSize: {
                width: paperWidth * 1000,
                height: pageHeight,
              },
            },
            (success, errorType) => {
              cleanup();
              if (success) {
                console.log("Print job sent successfully");
                resolve();
              } else {
                console.error("Print failed:", errorType);
                reject(new Error(`Print failed: ${errorType}`));
              }
            }
          );
        };

        const onFail = (_e: unknown, _c: unknown, desc: string) => {
          cleanup();
          reject(new Error(`Failed to load: ${desc}`));
        };

        printWindow.webContents.on("did-finish-load", onFinish);
        printWindow.webContents.on("did-fail-load", onFail);

        // Use loadURL with data URI so did-finish-load fires only after full
        // layout is complete — document.write() resolves before layout, causing
        // the right-side clipping seen when printing immediately after.
        printWindow
          .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
          .catch((err: Error) => {
            cleanup();
            reject(err);
          });
      } catch (error) {
        console.error("Error printing document:", error);
        reject(error);
      }
    });
  }

  destroy() {
    if (this.printWindow && !this.printWindow.isDestroyed()) {
      this.printWindow.removeAllListeners("close");
      this.printWindow.destroy();
      this.printWindow = null;
    }
  }
}
