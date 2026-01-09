import { PrintDocument, PrintBlock, ReceiptData } from "../types/printer.types";

export class DocumentConverterService {
  convertReceiptToDocument(receiptData: ReceiptData): PrintDocument {
    const blocks: PrintBlock[] = [];

    // Header
    if (receiptData.storeName) {
      blocks.push({
        type: "text",
        value: receiptData.storeName,
        style: { align: "center", bold: true, fontScale: 1.5, marginBottom: 5 },
      });
    }

    if (receiptData.storeAddress) {
      blocks.push({
        type: "text",
        value: receiptData.storeAddress,
        style: { align: "center", fontScale: 0.9 },
      });
    }

    if (receiptData.storePhone) {
      blocks.push({
        type: "text",
        value: receiptData.storePhone,
        style: { align: "center", fontScale: 0.9, marginBottom: 5 },
      });
    }

    blocks.push({ type: "divider" });

    // Receipt info
    if (receiptData.receiptNumber) {
      blocks.push({
        type: "text",
        value: `Receipt #: ${receiptData.receiptNumber}`,
        style: { marginTop: 5 },
      });
    }

    if (receiptData.date) {
      blocks.push({
        type: "text",
        value: `Date: ${receiptData.date}`,
        style: { marginBottom: 5 },
      });
    }

    blocks.push({ type: "divider" });

    // Items
    if (receiptData.items && receiptData.items.length > 0) {
      blocks.push({
        type: "table",
        headers: ["Item", "Qty", "Price", "Total"],
        rows: receiptData.items.map((item) => [
          item.name,
          item.quantity.toString(),
          `$${item.price.toFixed(2)}`,
          `$${item.total.toFixed(2)}`,
        ]),
        style: {
          columnAligns: ["left", "center", "right", "right"],
          marginTop: 5,
          marginBottom: 5,
        },
      });

      blocks.push({ type: "divider" });
    }

    // Totals
    const totalRows: string[][] = [];
    if (receiptData.subtotal !== undefined) {
      totalRows.push(["Subtotal:", `$${receiptData.subtotal.toFixed(2)}`]);
    }
    if (receiptData.tax !== undefined) {
      totalRows.push(["Tax:", `$${receiptData.tax.toFixed(2)}`]);
    }
    if (receiptData.total !== undefined) {
      totalRows.push(["TOTAL:", `$${receiptData.total.toFixed(2)}`]);
    }

    if (totalRows.length > 0) {
      blocks.push({
        type: "table",
        rows: totalRows,
        style: {
          columnAligns: ["left", "right"],
          marginTop: 5,
          marginBottom: 5,
        },
      });
    }

    if (receiptData.paymentMethod) {
      blocks.push({
        type: "text",
        value: `Payment: ${receiptData.paymentMethod}`,
        style: { marginTop: 10 },
      });
    }

    blocks.push({ type: "divider", style: { marginTop: 10 } });

    // Footer
    if (receiptData.footer) {
      blocks.push({
        type: "text",
        value: receiptData.footer,
        style: { align: "center", marginTop: 5 },
      });
    }

    blocks.push({
      type: "text",
      value: "Thank you for your business!",
      style: { align: "center", marginTop: 5 },
    });

    blocks.push({ type: "spacer", height: 20 });

    return { blocks };
  }
}
