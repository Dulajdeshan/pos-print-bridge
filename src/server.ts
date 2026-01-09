import express, { Request, Response } from "express";
import { getPrinters, printReceipt, printDocument } from "./printer";
import { PrintOptions, PrintDocument } from "./types/printer.types";

const app = express();
const PORT = 9000;

app.use(express.json());

// Enable CORS for cloud POS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "POS Printer Bridge is running" });
});

// Get all available printers
app.get("/api/printers", async (req: Request, res: Response) => {
  try {
    const printers = await getPrinters();
    res.json({
      success: true,
      printers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Print receipt (legacy format)
app.post("/api/print", async (req: Request, res: Response) => {
  try {
    const { printerId, receipt, options } = req.body;

    if (!printerId) {
      return res.status(400).json({
        success: false,
        error: "Printer ID is required",
      });
    }

    if (!receipt) {
      return res.status(400).json({
        success: false,
        error: "Receipt data is required",
      });
    }

    await printReceipt(printerId, receipt, options);

    res.json({
      success: true,
      message: "Print job sent successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Print document (advanced format)
app.post("/api/print-document", async (req: Request, res: Response) => {
  try {
    const { document, options } = req.body as {
      document: PrintDocument;
      options: PrintOptions;
    };

    if (!document || !document.blocks) {
      return res.status(400).json({
        success: false,
        error: "Document with blocks is required",
      });
    }

    if (!options || !options.printerName) {
      return res.status(400).json({
        success: false,
        error: "Print options with printerName is required",
      });
    }

    await printDocument(document, options);

    res.json({
      success: true,
      message: "Print job sent successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export function startServer() {
  app.listen(PORT, () => {
    console.log(
      `POS Printer Bridge server running on http://localhost:${PORT}`
    );
  });
}
