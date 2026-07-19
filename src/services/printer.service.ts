const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
import { Printer } from "../types/printer.types";

const PRINTER_CACHE_TTL_MS = 30_000;

export class PrinterService {
  private cachedPrinters: Printer[] | null = null;
  private cacheExpiresAt = 0;

  async getPrinters(): Promise<Printer[]> {
    if (this.cachedPrinters && Date.now() < this.cacheExpiresAt) {
      return this.cachedPrinters;
    }

    try {
      let printers: Printer[];
      if (process.platform === "win32") {
        printers = await this.getWindowsPrinters();
      } else if (process.platform === "darwin") {
        printers = await this.getMacOSPrinters();
      } else {
        printers = await this.getLinuxPrinters();
      }

      // Only cache when we actually found printers — an empty result is
      // usually a transient failure, so we don't want to serve it for the
      // full TTL and hide printers that come back moments later.
      if (printers.length > 0) {
        this.cachedPrinters = printers;
        this.cacheExpiresAt = Date.now() + PRINTER_CACHE_TTL_MS;
      }

      return printers;
    } catch (error) {
      console.error("Error getting printers:", error);
      throw error;
    }
  }

  private async getWindowsPrinters(): Promise<Printer[]> {
    // Default mechanism: wmic. If it returns no printers (or fails), fall
    // back to the PowerShell Get-Printer mechanism.
    const wmicPrinters = await this.getWindowsPrintersWmic();
    if (wmicPrinters.length > 0) {
      return wmicPrinters;
    }

    console.warn(
      "wmic returned no printers, falling back to PowerShell Get-Printer"
    );
    return this.getWindowsPrintersPowerShell();
  }

  private async getWindowsPrintersWmic(): Promise<Printer[]> {
    try {
      const { stdout } = await execPromise(
        "wmic printer get name,default /format:csv"
      );

      const lines = stdout.split("\n").filter((line: string) => line.trim());
      const printers: Printer[] = [];

      // CSV columns from wmic: Node,Default,Name
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
      console.error("Error getting Windows printers (wmic):", error);
      return [];
    }
  }

  private async getWindowsPrintersPowerShell(): Promise<Printer[]> {
    try {
      // PowerShell Get-Printer is ~10x faster than wmic on Windows
      const { stdout } = await execPromise(
        `powershell -NoProfile -NonInteractive -Command "Get-Printer | Select-Object -Property Name,Default | ConvertTo-Csv -NoTypeInformation"`,
        { timeout: 8000 }
      );

      const lines = stdout.split("\n").filter((line: string) => line.trim());
      const printers: Printer[] = [];

      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 2) {
          const name = parts[0].trim().replace(/^"|"$/g, "");
          const isDefault = parts[1].trim().replace(/^"|"$/g, "").toUpperCase() === "TRUE";

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
      console.error("Error getting Windows printers (PowerShell):", error);
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
