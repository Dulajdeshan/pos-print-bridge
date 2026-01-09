import {
  PrintDocument,
  PrintBlock,
  TextBlock,
  TableBlock,
  DividerBlock,
  SpacerBlock,
  ImageBlock,
  PrintOptions,
  PaperSize,
} from "../types/printer.types";

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
      bodyContent += this.renderBlock(block, actualBaseFontSize);
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
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
            font-family: 'Courier New', Courier, monospace;
            font-size: ${actualBaseFontSize}px;
            padding: 5mm;
            line-height: 1.4;
          }
          
          .text-left { text-align: left; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          
          .divider {
            border: none;
            margin: 5px 0;
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
          }
          
          table td {
            padding: 2px 4px;
            vertical-align: top;
          }
          
          img {
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        ${bodyContent}
      </body>
      </html>
    `;
  }

  private renderBlock(block: PrintBlock, baseFontSize: number): string {
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

    if (block.headers && block.headers.length > 0) {
      const headerAlign = style.headerAlign || "left";
      html += '<thead><tr class="' + headerBold + '">\n';
      block.headers.forEach((header, index) => {
        const align = style.columnAligns?.[index] || headerAlign;
        html += `<td class="text-${align}">${this.escapeHtml(header)}</td>\n`;
      });
      html += "</tr></thead>\n";
    }

    html += "<tbody>\n";
    block.rows.forEach((row) => {
      html += "<tr>\n";
      row.forEach((cell, index) => {
        const align = style.columnAligns?.[index] || "left";
        html += `<td class="text-${align}">${this.escapeHtml(cell)}</td>\n`;
      });
      html += "</tr>\n";
    });
    html += "</tbody>\n";

    html += "</table>\n";
    return html;
  }

  private renderDividerBlock(block: DividerBlock): string {
    const style = block.style || {};
    const marginTop = style.marginTop || 5;
    const marginBottom = style.marginBottom || 5;
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

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
