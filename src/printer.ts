import {
  Printer,
  PrintOptions,
  PrintDocument,
  ReceiptData,
} from "./types/printer.types";
import { PrinterService } from "./services/printer.service";
import { PrintService } from "./services/print.service";
import { DocumentConverterService } from "./services/document-converter.service";
import { HtmlGeneratorService } from "./services/html-generator.service";

// Service instances
const printerService = new PrinterService();
const printService = new PrintService();
const documentConverter = new DocumentConverterService();
const htmlGenerator = new HtmlGeneratorService();

// Export functions for API
export async function getPrinters(): Promise<Printer[]> {
  return printerService.getPrinters();
}

export async function printDocument(
  document: PrintDocument,
  options: PrintOptions
): Promise<void> {
  return printService.printDocument(document, options);
}

export async function printReceipt(
  printerId: string,
  receiptData: ReceiptData,
  options?: Partial<PrintOptions>
): Promise<void> {
  const document = documentConverter.convertReceiptToDocument(receiptData);
  const printOptions: PrintOptions = {
    printerName: printerId,
    paperSize: options?.paperSize || "80mm",
    fontSize: options?.fontSize || 12,
    fontScale: options?.fontScale || 1.0,
    copies: options?.copies || 1,
    silent: options?.silent !== false,
  };

  return printService.printDocument(document, printOptions);
}

export function generateDocumentPreview(
  document: PrintDocument,
  options: Partial<PrintOptions>
): string {
  const printOptions: PrintOptions = {
    printerName: "preview", // Not used for preview
    paperSize: options?.paperSize || "80mm",
    fontSize: options?.fontSize || 12,
    fontScale: options?.fontScale || 1.0,
    copies: 1,
    silent: true,
  };

  return htmlGenerator.generateDocumentHTML(document, printOptions);
}
