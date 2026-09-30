const { execFile } = require("child_process");
const util = require("util");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const execFilePromise = util.promisify(execFile);

// Minimal winspool bindings, loaded lazily so non-Windows platforms never
// touch koffi or winspool.drv. Each call runs on a koffi worker thread: the
// spooler can block for a long time, and a synchronous call would freeze the
// Electron main process — and with it the HTTP server.
type AsyncCall = (...args: unknown[]) => Promise<number>;

interface Winspool {
  OpenPrinterW: AsyncCall;
  StartDocPrinterW: AsyncCall;
  StartPagePrinter: AsyncCall;
  WritePrinter: AsyncCall;
  EndPagePrinter: AsyncCall;
  EndDocPrinter: AsyncCall;
  ClosePrinter: AsyncCall;
}

let winspool: Winspool | null = null;

function getWinspool(): Winspool {
  if (winspool) return winspool;

  const koffi = require("koffi");
  const lib = koffi.load("winspool.drv");
  const HANDLE = koffi.pointer("HANDLE", koffi.opaque());
  const DOC_INFO_1W = koffi.struct("DOC_INFO_1W", {
    pDocName: "str16",
    pOutputFile: "str16",
    pDatatype: "str16",
  });

  const bind = (name: string, result: string, args: unknown[]): AsyncCall =>
    util.promisify(lib.func("__stdcall", name, result, args).async);

  winspool = {
    OpenPrinterW: bind("OpenPrinterW", "int", [
      "str16",
      koffi.out(koffi.pointer(HANDLE)),
      "void *",
    ]),
    StartDocPrinterW: bind("StartDocPrinterW", "uint32", [
      HANDLE,
      "uint32",
      koffi.pointer(DOC_INFO_1W),
    ]),
    StartPagePrinter: bind("StartPagePrinter", "int", [HANDLE]),
    WritePrinter: bind("WritePrinter", "int", [
      HANDLE,
      "void *",
      "uint32",
      koffi.out(koffi.pointer("uint32")),
    ]),
    EndPagePrinter: bind("EndPagePrinter", "int", [HANDLE]),
    EndDocPrinter: bind("EndDocPrinter", "int", [HANDLE]),
    ClosePrinter: bind("ClosePrinter", "int", [HANDLE]),
  };
  return winspool;
}

/**
 * Sends bytes to a printer untouched (RAW datatype), bypassing the driver's
 * page model entirely — no paper size, no pagination, no clipping. The bytes
 * must already be in the printer's native language (ESC/POS here).
 */
export async function sendRawToPrinter(
  printerName: string,
  data: Buffer,
  docName = "POS Receipt"
): Promise<void> {
  if (process.platform === "win32") {
    await sendRawWindows(printerName, data, docName);
    return;
  }

  // CUPS: -o raw passes the bytes straight to the backend.
  const tmpFile = path.join(os.tmpdir(), `pos-raw-${Date.now()}.bin`);
  await fs.writeFile(tmpFile, data);
  try {
    await execFilePromise("lp", ["-d", printerName, "-o", "raw", tmpFile]);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

async function sendRawWindows(
  printerName: string,
  data: Buffer,
  docName: string
) {
  const ws = getWinspool();

  const out: unknown[] = [null];
  if (!(await ws.OpenPrinterW(printerName, out, null))) {
    throw new Error(`Printer "${printerName}" not found or could not be opened`);
  }
  const handle = out[0];

  try {
    const jobId = await ws.StartDocPrinterW(handle, 1, {
      pDocName: docName,
      pOutputFile: null,
      pDatatype: "RAW",
    });
    if (!jobId) {
      throw new Error(`Could not start print job on "${printerName}"`);
    }

    try {
      if (!(await ws.StartPagePrinter(handle))) {
        throw new Error("StartPagePrinter failed");
      }
      const written = [0];
      const ok = await ws.WritePrinter(handle, data, data.length, written);
      await ws.EndPagePrinter(handle);
      if (!ok || written[0] !== data.length) {
        throw new Error(
          `WritePrinter wrote ${written[0]} of ${data.length} bytes`
        );
      }
    } finally {
      await ws.EndDocPrinter(handle);
    }
  } finally {
    await ws.ClosePrinter(handle);
  }
}
