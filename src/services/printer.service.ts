const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
import { Printer } from "../types/printer.types";

export class PrinterService {
  async getPrinters(): Promise<Printer[]> {
    try {
      if (process.platform === "win32") {
        return await this.getWindowsPrinters();
      } else if (process.platform === "darwin") {
        return await this.getMacOSPrinters();
      } else {
        return await this.getLinuxPrinters();
      }
    } catch (error) {
      console.error("Error getting printers:", error);
      throw error;
    }
  }

  private async getWindowsPrinters(): Promise<Printer[]> {
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
            printers.push({
              id: name,
              name: name,
              displayName: name,
              isDefault: isDefault,
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

  private async getMacOSPrinters(): Promise<Printer[]> {
    try {
      // Get list of printers using lpstat
      const { stdout } = await execPromise("lpstat -p -d");
      const lines = stdout.split("\n").filter((line: string) => line.trim());
      const printers: Printer[] = [];
      let defaultPrinter = "";

      // Find default printer
      for (const line of lines) {
        if (line.includes("system default destination:")) {
          defaultPrinter = line.split(":")[1]?.trim() || "";
          break;
        }
      }

      // Parse printer list
      for (const line of lines) {
        if (line.startsWith("printer ")) {
          const match = line.match(/^printer\s+(\S+)/);
          if (match && match[1]) {
            const name = match[1];
            printers.push({
              id: name,
              name: name,
              displayName: name,
              isDefault: name === defaultPrinter,
            });
          }
        }
      }

      return printers;
    } catch (error) {
      console.error("Error getting macOS printers:", error);
      return [];
    }
  }

  private async getLinuxPrinters(): Promise<Printer[]> {
    try {
      // Get list of printers using lpstat (CUPS)
      const { stdout } = await execPromise("lpstat -p -d");
      const lines = stdout.split("\n").filter((line: string) => line.trim());
      const printers: Printer[] = [];
      let defaultPrinter = "";

      // Find default printer
      for (const line of lines) {
        if (line.includes("system default destination:")) {
          defaultPrinter = line.split(":")[1]?.trim() || "";
          break;
        } else if (line.includes("no system default destination")) {
          defaultPrinter = "";
        }
      }

      // Parse printer list
      for (const line of lines) {
        if (line.startsWith("printer ")) {
          const match = line.match(/^printer\s+(\S+)/);
          if (match && match[1]) {
            const name = match[1];
            printers.push({
              id: name,
              name: name,
              displayName: name,
              isDefault: name === defaultPrinter,
            });
          }
        }
      }

      return printers;
    } catch (error) {
      console.error("Error getting Linux printers:", error);
      return [];
    }
  }

  async verifyPrinter(printerName: string): Promise<boolean> {
    const printers = await this.getPrinters();
    return printers.some((p) => p.name === printerName);
  }
}
