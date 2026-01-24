export interface Printer {
  id: string;
  name: string;
  displayName: string;
  isDefault: boolean;
}

export type PaperSize = "80mm" | "78mm" | "76mm" | "58mm" | "57mm" | "44mm";

export type TextAlign = "left" | "center" | "right";

export type FontWeight = "normal" | "bold";

export interface PrintOptions {
  printerName: string;
  paperSize?: PaperSize;
  fontSize?: number; // Base font size in pixels (default: 12)
  fontScale?: number; // Scale multiplier (e.g., 1.2 = 120%, default: 1.0)
  copies?: number;
  silent?: boolean;
}

export interface TextBlock {
  type: "text";
  value: string;
  style?: {
    align?: TextAlign;
    bold?: boolean;
    fontSize?: number; // Specific font size for this block (overrides base)
    fontScale?: number; // Scale multiplier for this block
    marginTop?: number;
    marginBottom?: number;
  };
}

export interface TableBlock {
  type: "table";
  headers?: string[];
  rows: (string[] | string)[]; // Each row can be an array of cells OR a single string for full-width
  style?: {
    headerAlign?: TextAlign;
    columnAligns?: TextAlign[]; // Alignment per column
    columnWidths?: string[]; // Width per column as percentage (e.g., ["40%", "20%", "20%", "20%"])
    headerBold?: boolean;
    fontSize?: number;
    fontScale?: number;
    marginTop?: number;
    marginBottom?: number;
    columnBolds?: boolean[]; // Bold per column
    fullWidthRowAlign?: TextAlign; // Alignment for full-width rows (default: left)
    fullWidthRowBold?: boolean; // Bold for full-width rows (default: false)
  };
}

export interface DividerBlock {
  type: "divider";
  style?: {
    marginTop?: number;
    marginBottom?: number;
    lineStyle?: "solid" | "dashed" | "dotted";
  };
}

export interface SpacerBlock {
  type: "spacer";
  height?: number; // Height in pixels
}

export interface ImageBlock {
  type: "image";
  url: string; // Data URL or file path
  style?: {
    align?: TextAlign;
    width?: number; // Width in pixels
    height?: number; // Height in pixels
    marginTop?: number;
    marginBottom?: number;
  };
}

export type BarcodeType =
  | "CODE128"
  | "EAN13"
  | "EAN8"
  | "UPC"
  | "CODE39"
  | "ITF14"
  | "MSI"
  | "pharmacode";

export interface BarcodeBlock {
  type: "barcode";
  value: string; // The data to encode in the barcode
  barcodeType?: BarcodeType; // Type of barcode (default: CODE128)
  style?: {
    align?: TextAlign;
    width?: number; // Width in pixels (default: 200)
    height?: number; // Height in pixels (default: 50)
    displayValue?: boolean; // Show the value below barcode (default: true)
    fontSize?: number; // Font size for the value text (default: 12)
    marginTop?: number;
    marginBottom?: number;
  };
}

export type PrintBlock =
  | TextBlock
  | TableBlock
  | DividerBlock
  | SpacerBlock
  | ImageBlock
  | BarcodeBlock;

export interface PrintDocument {
  blocks: PrintBlock[];
}

// Legacy receipt data interface for backward compatibility
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
