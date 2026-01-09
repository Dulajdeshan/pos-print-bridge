const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

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

  return "ESC/POS";
}

function generateReceiptText(receiptData: ReceiptData): string {
  let receipt = "";
  const width = 48; // Standard thermal printer width in characters

  // Helper function to center text
  const center = (text: string) => {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return " ".repeat(padding) + text;
  };

  // Helper function to create line
  const line = () => "-".repeat(width);

  // Helper function to align text left and right
  const leftRight = (left: string, right: string) => {
    const spaces = Math.max(1, width - left.length - right.length);
    return left + " ".repeat(spaces) + right;
  };

  // Header
  if (receiptData.storeName) {
    receipt += center(receiptData.storeName.toUpperCase()) + "\n";
  }
  if (receiptData.storeAddress) {
    receipt += center(receiptData.storeAddress) + "\n";
  }
  if (receiptData.storePhone) {
    receipt += center(receiptData.storePhone) + "\n";
  }

  receipt += line() + "\n";

  // Receipt info
  if (receiptData.receiptNumber) {
    receipt += `Receipt #: ${receiptData.receiptNumber}\n`;
  }
  if (receiptData.date) {
    receipt += `Date: ${receiptData.date}\n`;
  }

  receipt += line() + "\n";

  // Items header
  if (receiptData.items && receiptData.items.length > 0) {
    receipt +=
      "Item".padEnd(24) +
      "Qty".padStart(6) +
      "Price".padStart(9) +
      "Total".padStart(9) +
      "\n";
    receipt += line() + "\n";

    // Items
    receiptData.items.forEach((item) => {
      const itemName =
        item.name.length > 24 ? item.name.substring(0, 21) + "..." : item.name;
      receipt += itemName.padEnd(24);
      receipt += item.quantity.toString().padStart(6);
      receipt += item.price.toFixed(2).padStart(9);
      receipt += item.total.toFixed(2).padStart(9);
      receipt += "\n";
    });

    receipt += line() + "\n";
  }

  // Totals
  if (receiptData.subtotal !== undefined) {
    receipt += leftRight("Subtotal:", receiptData.subtotal.toFixed(2)) + "\n";
  }
  if (receiptData.tax !== undefined) {
    receipt += leftRight("Tax:", receiptData.tax.toFixed(2)) + "\n";
  }
  if (receiptData.total !== undefined) {
    receipt += leftRight("TOTAL:", receiptData.total.toFixed(2)) + "\n";
  }

  if (receiptData.paymentMethod) {
    receipt += "\n";
    receipt += `Payment Method: ${receiptData.paymentMethod}\n`;
  }

  receipt += line() + "\n";

  // Footer
  if (receiptData.footer) {
    receipt += center(receiptData.footer) + "\n";
  }

  receipt += center("Thank you for your business!") + "\n";
  receipt += "\n\n\n"; // Add some space before cut

  return receipt;
}

export async function printReceipt(
  printerId: string,
  receiptData: ReceiptData
): Promise<void> {
  try {
    console.log(`Printing to: ${printerId}`);

    // Generate receipt text
    const receiptText = generateReceiptText(receiptData);

    // Create temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `receipt_${Date.now()}.txt`);

    // Write receipt to temp file
    await fs.writeFile(tempFile, receiptText, "utf8");
    console.log(`Receipt file created: ${tempFile}`);

    // Print using Windows print command
    // Escape printer name for command line
    const escapedPrinterName = printerId.replace(/"/g, '\\"');
    const escapedFilePath = tempFile.replace(/\\/g, "\\\\");

    // Use PowerShell to print the file
    const printCommand = `powershell -Command "Get-Content '${tempFile}' | Out-Printer -Name '${escapedPrinterName}'"`;

    console.log("Executing print command...");
    await execPromise(printCommand);

    console.log("Print job sent successfully");

    // Clean up temp file after a delay
    setTimeout(async () => {
      try {
        await fs.unlink(tempFile);
        console.log("Temp file cleaned up");
      } catch (err) {
        console.error("Error cleaning up temp file:", err);
      }
    }, 5000);
  } catch (error) {
    console.error("Error printing receipt:", error);
    throw error;
  }
}
