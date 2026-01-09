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

  constructor() {
    this.htmlGenerator = new HtmlGeneratorService();
    this.printerService = new PrinterService();
  }

  async printDocument(
    document: PrintDocument,
    options: PrintOptions
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log(`Printing to: ${options.printerName}`);
        console.log(`Paper size: ${options.paperSize || "80mm"}`);
        console.log(`Font scale: ${options.fontScale || 1.0}`);

        // Verify printer exists
        const printerExists = await this.printerService.verifyPrinter(
          options.printerName
        );
        if (!printerExists) {
          throw new Error(
            `Printer "${options.printerName}" not found in system`
          );
        }

        // Create hidden window for printing
        const printWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });

        // Generate HTML
        const html = this.htmlGenerator.generateDummyHTML(document, options);

        // Load HTML
        printWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        );

        printWindow.webContents.on("did-finish-load", () => {
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
              printWindow.close();

              if (success) {
                console.log("Print job sent successfully");
                resolve();
              } else {
                console.error("Print failed:", errorType);
                reject(new Error(`Print failed: ${errorType}`));
              }
            }
          );
        });

        printWindow.webContents.on(
          "did-fail-load",
          (event, errorCode, errorDescription) => {
            console.error("Failed to load print content:", errorDescription);
            printWindow.close();
            reject(new Error(`Failed to load: ${errorDescription}`));
          }
        );
      } catch (error) {
        console.error("Error printing document:", error);
        reject(error);
      }
    });
  }
}
