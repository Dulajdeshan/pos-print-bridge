const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
import { Printer } from "../types/printer.types";

export class PrinterService {
  async getPrinters(): Promise<Printer[]> {
    try {
      if (process.platform === "win32") {
        return await this.getWindowsPrinters();
      } else {
        // TODO: Add support for macOS and Linux
        return [];
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

  async verifyPrinter(printerName: string): Promise<boolean> {
    const printers = await this.getPrinters();
    return printers.some((p) => p.name === printerName);
  }
}
