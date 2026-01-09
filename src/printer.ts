import {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} from "node-thermal-printer";
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

export interface Printer {
  id: string;
  name: string;
  displayName: string;
  isDefault: boolean;
  type?: string;
}

export interface ReceiptData {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  receiptNumber?: string;
  date?: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal?: number;
  tax?: number;
  total?: number;
  paymentMethod?: string;
  footer?: string;
}

export async function getPrinters(): Promise<Printer[]> {
  try {
    if (process.platform === "win32") {
      return await getWindowsPrinters();
    } else {
      // For Linux/Mac, can use different methods
      return [];
    }
  } catch (error) {
    console.error("Error getting printers:", error);
    throw error;
  }
}

async function getWindowsPrinters(): Promise<Printer[]> {
  try {
    const { stdout } = await execPromise(
      "wmic printer get name,default /format:csv"
    );

    const lines = stdout.split("\n").filter((line: string) => line.trim());
    const printers: Printer[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length >= 2) {
        const isDefault = parts[1].trim().toUpperCase() === "TRUE";
        const name = parts[2]?.trim();

        if (name) {
          const detectedType = detectPrinterTypeName(name);
          printers.push({
            id: name,
            name: name,
            displayName: name,
            isDefault: isDefault,
            type: detectedType,
          });
        }
      }
    }

    return printers;
  } catch (error) {
    console.error("Error getting Windows printers:", error);
    return [];
  }
}

function detectPrinterTypeName(printerName: string): string {
  const nameLower = printerName.toLowerCase();

  if (nameLower.includes("star")) return "STAR";
  if (nameLower.includes("tanca")) return "TANCA";
  if (nameLower.includes("daruma")) return "DARUMA";
  if (nameLower.includes("brother")) return "BROTHER";

  return "EPSON/ESC-POS";
}

async function detectPrinterType(printerId: string): Promise<PrinterTypes> {
  const printerNameLower = printerId.toLowerCase();

  if (printerNameLower.includes("star")) {
    return PrinterTypes.STAR;
  } else if (printerNameLower.includes("tanca")) {
    return PrinterTypes.TANCA;
  } else if (printerNameLower.includes("daruma")) {
    return PrinterTypes.DARUMA;
  } else if (printerNameLower.includes("brother")) {
    return PrinterTypes.BROTHER;
  }

  // Default to EPSON as it's most compatible with generic ESC/POS printers
  return PrinterTypes.EPSON;
}

export async function printReceipt(
  printerId: string,
  receiptData: ReceiptData
): Promise<void> {
  try {
    const printerType = await detectPrinterType(printerId);

    const printer = new ThermalPrinter({
      type: printerType,
      interface: `printer:${printerId}`,
      characterSet: CharacterSet.PC437_USA,
      removeSpecialCharacters: false,
      lineCharacter: "-",
      options: {
        timeout: 5000,
      },
    });

    // Check if printer is connected
    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new Error(`Printer ${printerId} is not connected`);
    }

    // Build receipt
    printer.alignCenter();

    if (receiptData.storeName) {
      printer.setTextSize(1, 1);
      printer.bold(true);
      printer.println(receiptData.storeName);
      printer.bold(false);
      printer.setTextNormal();
    }

    if (receiptData.storeAddress) {
      printer.println(receiptData.storeAddress);
    }

    if (receiptData.storePhone) {
      printer.println(receiptData.storePhone);
    }

    printer.drawLine();

    printer.alignLeft();

    if (receiptData.receiptNumber) {
      printer.println(`Receipt #: ${receiptData.receiptNumber}`);
    }

    if (receiptData.date) {
      printer.println(`Date: ${receiptData.date}`);
    }

    printer.drawLine();

    // Print items
    if (receiptData.items && receiptData.items.length > 0) {
      printer.bold(true);
      printer.tableCustom([
        { text: "Item", align: "LEFT", width: 0.5 },
        { text: "Qty", align: "CENTER", width: 0.15 },
        { text: "Price", align: "RIGHT", width: 0.17 },
        { text: "Total", align: "RIGHT", width: 0.18 },
      ]);
      printer.bold(false);

      receiptData.items.forEach((item) => {
        printer.tableCustom([
          { text: item.name, align: "LEFT", width: 0.5 },
          { text: item.quantity.toString(), align: "CENTER", width: 0.15 },
          { text: item.price.toFixed(2), align: "RIGHT", width: 0.17 },
          { text: item.total.toFixed(2), align: "RIGHT", width: 0.18 },
        ]);
      });

      printer.drawLine();
    }

    // Print totals
    if (receiptData.subtotal !== undefined) {
      printer.tableCustom([
        { text: "Subtotal:", align: "LEFT", width: 0.7 },
        { text: receiptData.subtotal.toFixed(2), align: "RIGHT", width: 0.3 },
      ]);
    }

    if (receiptData.tax !== undefined) {
      printer.tableCustom([
        { text: "Tax:", align: "LEFT", width: 0.7 },
        { text: receiptData.tax.toFixed(2), align: "RIGHT", width: 0.3 },
      ]);
    }

    if (receiptData.total !== undefined) {
      printer.bold(true);
      printer.tableCustom([
        { text: "TOTAL:", align: "LEFT", width: 0.7 },
        { text: receiptData.total.toFixed(2), align: "RIGHT", width: 0.3 },
      ]);
      printer.bold(false);
    }

    if (receiptData.paymentMethod) {
      printer.newLine();
      printer.println(`Payment Method: ${receiptData.paymentMethod}`);
    }

    printer.drawLine();

    if (receiptData.footer) {
      printer.alignCenter();
      printer.println(receiptData.footer);
    }

    printer.alignCenter();
    printer.println("Thank you for your business!");

    printer.cut();

    await printer.execute();
    console.log("Print job sent successfully");
  } catch (error) {
    console.error("Error printing receipt:", error);
    throw error;
  }
}
