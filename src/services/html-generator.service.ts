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

export class HtmlGeneratorService {
  generateDocumentHTML(document: PrintDocument, options: PrintOptions): string {
    const paperWidth = PAPER_SIZES[options.paperSize || "80mm"];
    const baseFontSize = options.fontSize || 12;
    const fontScale = options.fontScale || 1.0;
    const actualBaseFontSize = Math.round(baseFontSize * fontScale);

    let bodyContent = "";
    document.blocks.forEach((block) => {
      bodyContent += this.renderBlock(block, paperWidth, actualBaseFontSize);
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
            line-height: 1.4;
            padding-top: 3mm;
            padding-bottom: 3mm;
          }
          
          .content-wrapper {
            max-width: ${paperWidth - 8}mm;
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
            padding: 2px 2px;
            vertical-align: top;
            word-wrap: break-word;
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
    baseFontSize: number
  ): string {
    switch (block.type) {
      case "text":
        return this.renderTextBlock(block, baseFontSize);
      case "table":
        return this.renderTableBlock(block, baseFontSize);
      case "divider":
        return this.renderDividerBlock(block);
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

  private renderTableBlock(block: TableBlock, baseFontSize: number): string {
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

    // Calculate column widths
    const numCols = block.headers?.length || block.rows[0]?.length || 0;
    let colWidths: string[] = [];

    // Smart column width distribution for thermal printers
    if (numCols === 4) {
      // Item, Qty, Price, Total - optimized for 80mm thermal
      colWidths = ["42%", "14%", "22%", "22%"];
    } else if (numCols === 2) {
      // Label and value columns (Subtotal, Tax, Total)
      colWidths = ["50%", "50%"];
    } else {
      // Equal distribution
      const width = Math.floor(100 / numCols);
      colWidths = Array(numCols).fill(`${width}%`);
    }

    if (block.headers && block.headers.length > 0) {
      const headerAlign = style.headerAlign || "left";
      html += '<thead><tr class="' + headerBold + '">\n';
      block.headers.forEach((header, index) => {
        const align = style.columnAligns?.[index] || headerAlign;
        html += `<td class="text-${align}" style="width: ${
          colWidths[index]
        }; white-space: nowrap;">${this.escapeHtml(header)}</td>\n`;
      });
      html += "</tr></thead>\n";
    }

    html += "<tbody>\n";
    block.rows.forEach((row) => {
      html += "<tr>\n";

      // Check if this is a full-width row (single string) or a normal row (array)
      if (typeof row === "string") {
        // Full-width row
        const fullWidthAlign = style.fullWidthRowAlign || "left";
        const bold = style.fullWidthRowBold ? "bold" : "";
        html += `<td colspan="${numCols}" class="text-${fullWidthAlign}">${this.escapeHtml(
          row
        )}</td>\n`;
      } else {
        // Normal row with multiple cells
        row.forEach((cell, index) => {
          const align = style.columnAligns?.[index] || "left";
          const bold = style.cellBold?.[index] ? "bold" : "";
          html += `<td class="text-${align} ${bold}" style="width: ${
            colWidths[index]
          }">${this.escapeHtml(cell)}</td>\n`;
        });
      }

      html += "</tr>\n";
    });
    html += "</tbody>\n";

    html += "</table>\n";
    return html;
  }

  private renderDividerBlock(block: DividerBlock): string {
    const style = block.style || {};
    const marginTop = style.marginTop || 5;
    const marginBottom = style.marginBottom || 0;
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
