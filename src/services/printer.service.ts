const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);
import { Printer } from "../types/printer.types";

const PRINTER_CACHE_TTL_MS = 30_000;

export class PrinterService {
  private cachedPrinters: Printer[] | null = null;
  private cacheExpiresAt = 0;

  async getPrinters(forceRefresh = false): Promise<Printer[]> {
    if (!forceRefresh && this.cachedPrinters && Date.now() < this.cacheExpiresAt) {
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
        "wmic printer get name,default /format:csv",
        { timeout: 8000, windowsHide: true }
      );

      const lines = stdout.split("\n").filter((line: string) => line.trim());
      const printers: Printer[] = [];

      // CSV columns from wmic: Node,Default,Name
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");
        if (parts.length >= 2) {
          const isDefault = parts[1].trim().toUpperCase() === "TRUE";
          // Name is the last column, so re-join it — printer names may
          // themselves contain commas.
          const name = parts.slice(2).join(",").trim();

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
      // Win32_Printer rather than Get-Printer: it is the class that actually
      // exposes `Default`, and via CIM it is still far faster than wmic.
      // JSON rather than CSV so printer names containing commas survive.
      const { stdout } = await execPromise(
        `powershell -NoProfile -NonInteractive -Command "Get-CimInstance -ClassName Win32_Printer | Select-Object -Property Name,Default | ConvertTo-Json -Compress"`,
        { timeout: 8000, windowsHide: true }
      );

      const trimmed = String(stdout).trim();
      if (!trimmed) {
        return [];
      }

      const parsed = JSON.parse(trimmed);
      // A single printer comes back as an object, not an array.
      const rows: Array<{ Name?: string; Default?: boolean }> = Array.isArray(
        parsed
      )
        ? parsed
        : [parsed];

      const printers: Printer[] = [];
      for (const row of rows) {
        const name = row?.Name?.trim();
        if (name) {
          printers.push({
            id: name,
            name: name,
            displayName: name,
            isDefault: row.Default === true,
          });
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
    const target = printerName.trim().toLowerCase();
    // Windows printer names are case-insensitive, so match accordingly.
    const matches = (printers: Printer[]) =>
      printers.some((p) => p.name.trim().toLowerCase() === target);

    if (matches(await this.getPrinters())) {
      return true;
    }

    // A miss may just mean the cached list is stale (printer added or renamed
    // since), so re-enumerate once before believing it.
    const fresh = await this.getPrinters(true);
    if (matches(fresh)) {
      return true;
    }

    if (fresh.length === 0) {
      // Enumeration itself failed — WMI/spooler hiccups return an empty list
      // even while the printer is perfectly healthy. Don't block the job on a
      // failed lookup; let the actual print call decide.
      console.warn(
        `Printer enumeration returned no printers; proceeding with "${printerName}" anyway`
      );
      return true;
    }

    return false;
  }
}

// Shared instance: one cache for the whole app, so the HTTP printer list
// and the pre-print verification never disagree.
export const printerService = new PrinterService();
