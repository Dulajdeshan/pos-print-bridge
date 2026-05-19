import { BrowserWindow } from "electron";
import { PrintDocument, PrintOptions, PaperSize } from "../types/printer.types";
import { HtmlGeneratorService } from "./html-generator.service";
import { PrinterService } from "./printer.service";

const PAPER_SIZES: Record<PaperSize, number> = {
  "80mm": 80,
  "78mm": 78,
  "76mm": 76,
  "58mm": 58,
  "57mm": 57,
  "44mm": 44,
};

export class PrintService {
  private htmlGenerator: HtmlGeneratorService;
  private printerService: PrinterService;
  private printWindow: BrowserWindow | null = null;
  private printQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.htmlGenerator = new HtmlGeneratorService();
    this.printerService = new PrinterService();
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
    // Serialise jobs so the shared window is never used concurrently
    this.printQueue = this.printQueue.then(() =>
      this._printDocument(document, options)
    );
    return this.printQueue;
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

        // Verify printer exists (uses cached list — no extra wmic/PS call)
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

        // Use executeJavaScript to update content without a full navigation reload
        const loaded = new Promise<void>((res, rej) => {
          if (printWindow.webContents.getURL() === "") {
            // First load — navigate once to a blank page then inject
            printWindow.loadURL("about:blank");
            printWindow.webContents.once("did-finish-load", () => res());
            printWindow.webContents.once("did-fail-load", (_e, _c, desc) =>
              rej(new Error(`Failed to load: ${desc}`))
            );
          } else {
            res();
          }
        });

        await loaded;

        await printWindow.webContents.executeJavaScript(
          `document.open();document.write(${JSON.stringify(html)});document.close();`
        );

        const paperWidth = PAPER_SIZES[options.paperSize || "80mm"];

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
              height: 297000,
            },
          },
          (success, errorType) => {
            if (success) {
              console.log("Print job sent successfully");
              resolve();
            } else {
              console.error("Print failed:", errorType);
              reject(new Error(`Print failed: ${errorType}`));
            }
          }
        );
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
