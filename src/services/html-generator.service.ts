import {
  PrintDocument,
  PrintBlock,
  TextBlock,
  TableBlock,
  DividerBlock,
  SpacerBlock,
  ImageBlock,
  BarcodeBlock,
  PrintOptions,
  PaperSize,
  ReceiptDesign,
} from "../types/printer.types";
import JsBarcode from "jsbarcode";
import { createCanvas } from "canvas";
import { getFontFaceCSS } from "./fonts";

const PAPER_SIZES: Record<PaperSize, number> = {
  "80mm": 80,
  "78mm": 78,
  "76mm": 76,
  "58mm": 58,
  "57mm": 57,
  "44mm": 44,
};

interface DesignPreset {
  lineHeight: number;
  pagePaddingMm: number; // Top and bottom page padding
  cellPaddingY: number; // Vertical padding of table cells in px
  dividerMarginTop: number; // Divider margins when the block sets none
  dividerMarginBottom: number;
  rowSeparatorGap: number; // Space above and below a table row separator in px
}

// "default" holds the original spacing so existing receipts render unchanged.
const DESIGN_PRESETS: Record<ReceiptDesign, DesignPreset> = {
  default: {
    lineHeight: 1.4,
    pagePaddingMm: 3,
    cellPaddingY: 2,
    dividerMarginTop: 5,
    dividerMarginBottom: 0,
    rowSeparatorGap: 3,
  },
  compact: {
    lineHeight: 1.15,
    pagePaddingMm: 1.5,
    cellPaddingY: 0,
    dividerMarginTop: 3,
    dividerMarginBottom: 3,
    rowSeparatorGap: 2,
  },
};

export class HtmlGeneratorService {
  generateDocumentHTML(document: PrintDocument, options: PrintOptions): string {
    const paperWidth = PAPER_SIZES[options.paperSize || "80mm"];
    const marginLeft = options.marginLeft || 0;
    const marginRight = options.marginRight || 0;
    const baseFontSize = options.fontSize || 12;
    const fontScale = options.fontScale || 1.0;
    const actualBaseFontSize = Math.round(baseFontSize * fontScale);
    const design = DESIGN_PRESETS[options.design || "default"] || DESIGN_PRESETS.default;

    let bodyContent = "";
    document.blocks.forEach((block) => {
      bodyContent += this.renderBlock(block, paperWidth, actualBaseFontSize, design);
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          ${getFontFaceCSS()}

          @page {
            size: ${paperWidth}mm auto;
            margin: 0;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            width: ${paperWidth}mm;
            font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
            font-size: ${actualBaseFontSize}px;
            line-height: ${design.lineHeight};
            padding-top: ${design.pagePaddingMm}mm;
            padding-bottom: ${design.pagePaddingMm}mm;
            padding-left: ${marginLeft}mm;
            padding-right: ${marginRight}mm;
          }

          .content-wrapper {
            width: 100%;
          }
          
          .text-left { text-align: left; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          
          .divider {
            border: none;
            margin: 6px 0;
          }
          
          .divider-solid {
            border-top: 1px solid #000;
          }
          
          .divider-dashed {
            border-top: 1px dashed #000;
          }
          
          .divider-dotted {
            border-top: 1px dotted #000;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          
          table td {
            padding: ${design.cellPaddingY}px 2px;
            vertical-align: top;
            word-wrap: break-word;
          }

          table td.row-separator {
            padding: 0;
          }
          
          img {
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <div class="content-wrapper">
          ${bodyContent}
        </div>
      </body>
      </html>
    `;
  }

  private renderBlock(
    block: PrintBlock,
    paperWidth: number,
    baseFontSize: number,
    design: DesignPreset
  ): string {
    switch (block.type) {
      case "text":
        return this.renderTextBlock(block, baseFontSize);
      case "table":
        return this.renderTableBlock(block, baseFontSize, design);
      case "divider":
        return this.renderDividerBlock(block, design);
      case "spacer":
        return this.renderSpacerBlock(block);
      case "image":
        return this.renderImageBlock(block);
      case "barcode":
        return this.renderBarcodeBlock(block, paperWidth);
      default:
        return "";
    }
  }

  private renderTextBlock(block: TextBlock, baseFontSize: number): string {
    const style = block.style || {};
    const fontSize = style.fontSize
      ? Math.round(style.fontSize * (style.fontScale || 1.0))
      : style.fontScale
      ? Math.round(baseFontSize * style.fontScale)
      : baseFontSize;

    const align = style.align || "left";
    const bold = style.bold ? "bold" : "";
    const marginTop = style.marginTop || 0;
    const marginBottom = style.marginBottom || 0;

    const inlineStyle = `font-size: ${fontSize}px; margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;`;

    return `<div class="text-${align} ${bold}" style="${inlineStyle}">${this.escapeHtml(
      block.value
    )}</div>\n`;
  }

  private renderTableBlock(
    block: TableBlock,
    baseFontSize: number,
    design: DesignPreset
  ): string {
    const style = block.style || {};
    const fontSize = style.fontSize
      ? Math.round(style.fontSize * (style.fontScale || 1.0))
      : style.fontScale
      ? Math.round(baseFontSize * style.fontScale)
      : baseFontSize;

    const marginTop = style.marginTop || 0;
    const marginBottom = style.marginBottom || 0;
    const headerBold = style.headerBold !== false ? "bold" : "";

    const tableStyle = `font-size: ${fontSize}px; margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;`;

    let html = `<table style="${tableStyle}">\n`;

    // Calculate maximum number of columns across all rows
    let maxCols = block.headers?.length || 0;
    block.rows.forEach((row) => {
      if (Array.isArray(row)) {
        maxCols = Math.max(maxCols, row.length);
      }
    });

    // Helper function to get column widths for a specific number of columns
    const getColWidths = (numCols: number): string[] => {
      // Use custom column widths if provided and matches
      if (style.columnWidths && style.columnWidths.length === numCols) {
        return style.columnWidths;
      } else if (numCols === 4) {
        // Item, Qty, Price, Total - optimized for 80mm thermal
        return ["42%", "14%", "22%", "22%"];
      } else if (numCols === 2) {
        // Label and value columns (Subtotal, Tax, Total)
        return ["50%", "50%"];
      } else {
        // Equal distribution
        const width = Math.floor(100 / numCols);
        return Array(numCols).fill(`${width}%`);
      }
    };

    if (block.headers && block.headers.length > 0) {
      const headerAlign = style.headerAlign || "left";
      const headerColWidths = getColWidths(block.headers.length);
      html += '<thead><tr class="' + headerBold + '">\n';
      block.headers.forEach((header, index) => {
        const align = style.columnAligns?.[index] || headerAlign;
        html += `<td class="text-${align}" style="width: ${
          headerColWidths[index]
        }; white-space: nowrap;">${this.escapeHtml(header)}</td>\n`;
      });
      html += "</tr></thead>\n";
    }

    // A full-width row (e.g. a product name) starts a new group; without any,
    // each row is its own group.
    const groupedByFullWidthRows = block.rows.some(
      (row) => typeof row === "string"
    );
    const separatorStyle = `margin: ${design.rowSeparatorGap}px 0;`;

    html += "<tbody>\n";
    block.rows.forEach((row, rowIndex) => {
      const startsGroup = !groupedByFullWidthRows || typeof row === "string";
      if (style.rowSeparator && rowIndex > 0 && startsGroup) {
        html += `<tr><td colspan="${maxCols}" class="row-separator"><div class="divider divider-${style.rowSeparator}" style="${separatorStyle}"></div></td></tr>\n`;
      }

      html += "<tr>\n";

      // Check if this is a full-width row (single string) or a normal row (array)
      if (typeof row === "string") {
        // Full-width row - use maxCols for colspan
        const fullWidthAlign = style.fullWidthRowAlign || "left";
        const bold = style.fullWidthRowBold ? "bold" : "";
        html += `<td colspan="${maxCols}" class="text-${fullWidthAlign} ${bold}">${this.escapeHtml(
          row
        )}</td>\n`;
      } else {
        // Normal row with multiple columns - calculate widths for this specific row
        const rowColWidths = getColWidths(row.length);
        row.forEach((cell, index) => {
          const align = style.columnAligns?.[index] || "left";
          const bold = style.columnBolds?.[index] ? "bold" : "";
          html += `<td class="text-${align} ${bold}" style="width: ${
            rowColWidths[index]
          }">${this.escapeHtml(cell)}</td>\n`;
        });
      }

      html += "</tr>\n";
    });
    html += "</tbody>\n";

    html += "</table>\n";
    return html;
  }

  private renderDividerBlock(block: DividerBlock, design: DesignPreset): string {
    const style = block.style || {};
    const marginTop = style.marginTop ?? design.dividerMarginTop;
    const marginBottom = style.marginBottom ?? design.dividerMarginBottom;
    const lineStyle = style.lineStyle || "dashed";

    const inlineStyle = `margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;`;

    return `<div class="divider divider-${lineStyle}" style="${inlineStyle}"></div>\n`;
  }

  private renderSpacerBlock(block: SpacerBlock): string {
    const height = block.height || 10;
    return `<div style="height: ${height}px;"></div>\n`;
  }

  private renderImageBlock(block: ImageBlock): string {
    const style = block.style || {};
    const align = style.align || "center";
    const marginTop = style.marginTop || 0;
    const marginBottom = style.marginBottom || 0;

    let imgStyle = `margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;`;
    if (style.width) imgStyle += ` width: ${style.width}px;`;
    if (style.height) imgStyle += ` height: ${style.height}px;`;

    return `<div class="text-${align}"><img src="${this.escapeHtml(
      block.url
    )}" style="${imgStyle}" /></div>\n`;
  }

  private renderBarcodeBlock(block: BarcodeBlock, paperWidth: number): string {
    const style = block.style || {};
    const align = style.align || "center";

    // Calculate default width based on paper size (50% of usable width)
    // Converting mm to pixels at 96 DPI: 1mm ≈ 3.78 pixels
    const usableWidthMm = paperWidth - 8; // Subtract margins
    const defaultWidthPx = Math.round(usableWidthMm * 3.78 * 0.5); // 50% of usable width

    const width = style.width || defaultWidthPx;
    const height = style.height || 50;
    const displayValue = style.displayValue !== false;
    const fontSize = style.fontSize || 12;
    const marginTop = style.marginTop || 0;
    const marginBottom = style.marginBottom || 0;
    const barcodeType = block.barcodeType || "CODE128";

    try {
      // Create a canvas and generate barcode (without text)
      const canvas = createCanvas(width, height);

      JsBarcode(canvas, block.value, {
        format: barcodeType,
        width: 2,
        height: height,
        displayValue: false, // Always false - we'll render text ourselves
        margin: 0,
      });

      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL("image/png");

      const imgStyle = `margin-top: ${marginTop}px; max-width: 100%; width: ${width}px;`;

      let html = `<div class="text-${align}">\n`;
      html += `  <img src="${dataUrl}" style="${imgStyle}" />\n`;

      // Add custom text below barcode if displayValue is true
      if (displayValue) {
        html += `  <div style="font-size: ${fontSize}px; margin-top: 2px; margin-bottom: ${marginBottom}px; font-family: 'Roboto Mono', 'Courier New', monospace;">${this.escapeHtml(
          block.value
        )}</div>\n`;
      } else {
        // If no text, add bottom margin to the container
        html += `  <div style="margin-bottom: ${marginBottom}px;"></div>\n`;
      }

      html += `</div>\n`;

      return html;
    } catch (error) {
      console.error("Failed to generate barcode:", error);
      // Fallback to text if barcode generation fails
      return `<div class="text-${align}" style="margin-top: ${marginTop}px; margin-bottom: ${marginBottom}px;">${this.escapeHtml(
        block.value
      )}</div>\n`;
    }
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    // First escape HTML special characters, then convert \n to <br>
    return text.replace(/[&<>"']/g, (m) => map[m]).replace(/\n/g, "<br>");
  }
}
