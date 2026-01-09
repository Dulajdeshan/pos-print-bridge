const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
import { PosPrinter, PosPrintOptions } from "electron-pos-printer";

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
  if (nameLower.includes("bematech")) return "BEMATECH";
  if (nameLower.includes("xprint") || nameLower.includes("xp-"))
    return "XPrint";

  return "Thermal";
}

export async function printReceipt(
  printerId: string,
  receiptData: ReceiptData
): Promise<void> {
  try {
    console.log(`Printing to: ${printerId}`);

    // Build receipt data for electron-pos-printer
    const data: any[] = [];

    // Store header
    if (receiptData.storeName) {
      data.push({
        type: "text",
        value: receiptData.storeName,
        style: {
          fontWeight: "bold",
          textAlign: "center",
          fontSize: "18px",
          marginTop: "10px",
        },
      });
    }

    if (receiptData.storeAddress) {
      data.push({
        type: "text",
        value: receiptData.storeAddress,
        style: { textAlign: "center", fontSize: "12px" },
      });
    }

    if (receiptData.storePhone) {
      data.push({
        type: "text",
        value: receiptData.storePhone,
        style: { textAlign: "center", fontSize: "12px", marginBottom: "10px" },
      });
    }

    // Divider
    data.push({
      type: "text",
      value: "--------------------------------",
      style: { textAlign: "center" },
    });

    // Receipt info
    if (receiptData.receiptNumber) {
      data.push({
        type: "text",
        value: `Receipt #: ${receiptData.receiptNumber}`,
        style: { fontSize: "12px", marginTop: "5px" },
      });
    }

    if (receiptData.date) {
      data.push({
        type: "text",
        value: `Date: ${receiptData.date}`,
        style: { fontSize: "12px", marginBottom: "10px" },
      });
    }

    // Divider
    data.push({
      type: "text",
      value: "--------------------------------",
      style: { textAlign: "center" },
    });

    // Items table
    if (receiptData.items && receiptData.items.length > 0) {
      // Table header
      data.push({
        type: "table",
        style: { marginTop: "10px", fontSize: "12px" },
        tableHeader: ["Item", "Qty", "Price", "Total"],
        tableBody: receiptData.items.map((item) => [
          item.name,
          item.quantity.toString(),
          `$${item.price.toFixed(2)}`,
          `$${item.total.toFixed(2)}`,
        ]),
        tableHeaderStyle: { fontWeight: "bold", fontSize: "12px" },
        tableBodyStyle: { fontSize: "12px" },
      });
    }

    // Divider
    data.push({
      type: "text",
      value: "--------------------------------",
      style: { textAlign: "center", marginTop: "10px" },
    });

    // Totals
    if (receiptData.subtotal !== undefined) {
      data.push({
        type: "table",
        style: { fontSize: "12px" },
        tableBody: [["Subtotal:", `$${receiptData.subtotal.toFixed(2)}`]],
        tableBodyStyle: { fontSize: "12px" },
      });
    }

    if (receiptData.tax !== undefined) {
      data.push({
        type: "table",
        style: { fontSize: "12px" },
        tableBody: [["Tax:", `$${receiptData.tax.toFixed(2)}`]],
        tableBodyStyle: { fontSize: "12px" },
      });
    }

    if (receiptData.total !== undefined) {
      data.push({
        type: "table",
        style: { fontSize: "14px", fontWeight: "bold", marginTop: "5px" },
        tableBody: [["TOTAL:", `$${receiptData.total.toFixed(2)}`]],
        tableBodyStyle: { fontSize: "14px", fontWeight: "bold" },
      });
    }

    if (receiptData.paymentMethod) {
      data.push({
        type: "text",
        value: `Payment: ${receiptData.paymentMethod}`,
        style: { fontSize: "12px", marginTop: "10px" },
      });
    }

    // Divider
    data.push({
      type: "text",
      value: "--------------------------------",
      style: { textAlign: "center", marginTop: "10px" },
    });

    // Footer
    if (receiptData.footer) {
      data.push({
        type: "text",
        value: receiptData.footer,
        style: { textAlign: "center", fontSize: "12px", marginTop: "5px" },
      });
    }

    data.push({
      type: "text",
      value: "Thank you for your business!",
      style: {
        textAlign: "center",
        fontSize: "12px",
        marginTop: "5px",
        marginBottom: "20px",
      },
    });

    // Print options
    const options: PosPrintOptions = {
      preview: false,
      margin: "0 0 0 0",
      copies: 1,
      printerName: printerId,
      timeOutPerLine: 400,
      pageSize: "80mm",
      boolean: false,
    };

    // Execute print
    await PosPrinter.print(data, options);

    console.log("Print job sent successfully");
  } catch (error) {
    console.error("Error printing receipt:", error);
    throw error;
  }
}
