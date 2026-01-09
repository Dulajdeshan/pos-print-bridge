import express, { Request, Response } from "express";
import { getPrinters, printReceipt } from "./printer";

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

// Print receipt
app.post("/api/print", async (req: Request, res: Response) => {
  try {
    const { printerId, receipt } = req.body;

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

    await printReceipt(printerId, receipt);

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
