const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
import { BrowserWindow } from "electron";

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
  if (
    nameLower.includes("xprint") ||
    nameLower.includes("xp-") ||
    nameLower.includes("pos-")
  )
    return "Thermal";

  return "Thermal";
}

function generateReceiptHTML(receiptData: ReceiptData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          size: 80mm auto;
          margin: 0;
        }
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          width: 80mm;
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          padding: 10px;
        }
        
        .center {
          text-align: center;
        }
        
        .bold {
          font-weight: bold;
        }
        
        .large {
          font-size: 16px;
        }
        
        .divider {
          border-top: 1px dashed #000;
          margin: 10px 0;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        
        table td {
          padding: 3px 0;
        }
        
        .item-name {
          width: 50%;
        }
        
        .item-qty {
          width: 15%;
          text-align: center;
        }
        
        .item-price {
          width: 17.5%;
          text-align: right;
        }
        
        .item-total {
          width: 17.5%;
          text-align: right;
        }
        
        .total-row td:first-child {
          text-align: left;
        }
        
        .total-row td:last-child {
          text-align: right;
        }
        
        .spacer {
          height: 20px;
        }
      </style>
    </head>
    <body>
      ${
        receiptData.storeName
          ? `<div class="center bold large">${receiptData.storeName}</div>`
          : ""
      }
      ${
        receiptData.storeAddress
          ? `<div class="center">${receiptData.storeAddress}</div>`
          : ""
      }
      ${
        receiptData.storePhone
          ? `<div class="center">${receiptData.storePhone}</div>`
          : ""
      }
      
      <div class="divider"></div>
      
      ${
        receiptData.receiptNumber
          ? `<div>Receipt #: ${receiptData.receiptNumber}</div>`
          : ""
      }
      ${receiptData.date ? `<div>Date: ${receiptData.date}</div>` : ""}
      
      <div class="divider"></div>
      
      ${
        receiptData.items && receiptData.items.length > 0
          ? `
        <table>
          <thead>
            <tr class="bold">
              <td class="item-name">Item</td>
              <td class="item-qty">Qty</td>
              <td class="item-price">Price</td>
              <td class="item-total">Total</td>
            </tr>
          </thead>
          <tbody>
            ${receiptData.items
              .map(
                (item) => `
              <tr>
                <td class="item-name">${item.name}</td>
                <td class="item-qty">${item.quantity}</td>
                <td class="item-price">$${item.price.toFixed(2)}</td>
                <td class="item-total">$${item.total.toFixed(2)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
        
        <div class="divider"></div>
      `
          : ""
      }
      
      <table>
        ${
          receiptData.subtotal !== undefined
            ? `
          <tr class="total-row">
            <td>Subtotal:</td>
            <td>$${receiptData.subtotal.toFixed(2)}</td>
          </tr>
        `
            : ""
        }
        ${
          receiptData.tax !== undefined
            ? `
          <tr class="total-row">
            <td>Tax:</td>
            <td>$${receiptData.tax.toFixed(2)}</td>
          </tr>
        `
            : ""
        }
        ${
          receiptData.total !== undefined
            ? `
          <tr class="total-row bold large">
            <td>TOTAL:</td>
            <td>$${receiptData.total.toFixed(2)}</td>
          </tr>
        `
            : ""
        }
      </table>
      
      ${
        receiptData.paymentMethod
          ? `<div style="margin-top: 10px;">Payment: ${receiptData.paymentMethod}</div>`
          : ""
      }
      
      <div class="divider"></div>
      
      ${
        receiptData.footer
          ? `<div class="center">${receiptData.footer}</div>`
          : ""
      }
      <div class="center">Thank you for your business!</div>
      
      <div class="spacer"></div>
    </body>
    </html>
  `;
}

export async function printReceipt(
  printerId: string,
  receiptData: ReceiptData
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Printing to: ${printerId}`);

      // Create hidden window for printing
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const html = generateReceiptHTML(receiptData);

      printWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
      );

      printWindow.webContents.on("did-finish-load", () => {
        // Get list of printers to verify the printer exists
        printWindow.webContents
          .getPrintersAsync()
          .then((printers) => {
            console.log(
              "Available printers:",
              printers.map((p) => p.name)
            );

            const printerExists = printers.some((p) => p.name === printerId);

            if (!printerExists) {
              console.error(`Printer "${printerId}" not found in system`);
              printWindow.close();
              reject(new Error(`Printer "${printerId}" not found`));
              return;
            }

            // Print with specific printer
            printWindow.webContents.print(
              {
                silent: true,
                printBackground: true,
                deviceName: printerId,
                margins: {
                  marginType: "none",
                },
                pageSize: {
                  width: 80000, // 80mm in microns
                  height: 297000, // Auto height, will be trimmed
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
          })
          .catch((error) => {
            console.error("Error getting printers:", error);
            printWindow.close();
            reject(error);
          });
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
      console.error("Error printing receipt:", error);
      reject(error);
    }
  });
}
