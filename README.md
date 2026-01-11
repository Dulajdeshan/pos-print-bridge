# POS Printer Bridge

An Electron-based bridge application that enables cloud POS systems to communicate with local thermal printers.

## Features

- 🖨️ List all available printers on the system
- 📄 **Two printing modes:**
  - Legacy receipt format (simple, backward compatible)
  - Advanced document format (full control with blocks)
- 📏 **Multiple paper sizes:** 80mm, 78mm, 76mm, 58mm, 57mm, 44mm
- 🔤 **Font scaling:** Adjustable font sizes (e.g., 120% = fontScale: 1.2)
- 🎨 **Rich formatting:**
  - Text blocks with alignment, bold, custom sizing
  - Tables with column alignment and full-width rows for lengthy content
  - Dividers (solid, dashed, dotted)
  - Spacers for custom spacing
  - Image support
  - Barcode support (CODE128, EAN13, EAN8, UPC, CODE39, ITF14, MSI, pharmacode)
- 💪 Works with XPrint, EPSON, Star, and any thermal printer
- 🌐 RESTful API for easy integration
- 🪟 Windows support with system tray integration
- 🔄 Runs in the background
- 📐 **Fixed left padding** - Proper 5mm margins for perfect alignment

## Installation

### For Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the app
npm start
```

### For Production

Download the installer from the [Releases](https://github.com/yourusername/pos-printer-bridge/releases) page.

## API Documentation

The bridge runs a local server on `http://localhost:3456`

### 1. Get Available Printers

**Endpoint:** `GET /api/printers`

**Response:**

```json
{
  "success": true,
  "printers": [
    {
      "id": "Printer-Name",
      "name": "Printer-Name",
      "displayName": "Printer-Name",
      "isDefault": true,
      "type": "EPSON/ESC-POS"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "printers": [
    {
      "id": "POS-80C",
      "name": "POS-80C",
      "displayName": "POS-80C",
      "isDefault": false
    }
  ]
}
```

### 2. Print Receipt (Legacy Format)

**Endpoint:** `POST /api/print`

**Request Body:**

```json
{
  "printerId": "POS-80C",
  "receipt": {
    "storeName": "My Store",
    "storeAddress": "123 Main St, City, State 12345",
    "storePhone": "(555) 123-4567",
    "receiptNumber": "R-001",
    "date": "2024-01-09 14:30:00",
    "items": [
      {
        "name": "Product 1",
        "quantity": 2,
        "price": 10.0,
        "total": 20.0
      }
    ],
    "subtotal": 35.5,
    "tax": 3.55,
    "total": 39.05,
    "paymentMethod": "Cash",
    "footer": "Visit us at www.mystore.com"
  },
  "options": {
    "paperSize": "80mm",
    "fontSize": 12,
    "fontScale": 1.0
  }
}
```

### 3. Print Document (Advanced Format)

**Endpoint:** `POST /api/print-document`

**Supported Paper Sizes:** `80mm`, `78mm`, `76mm`, `58mm`, `57mm`, `44mm`

**Request Body:**

```json
{
  "document": {
    "blocks": [
      {
        "type": "text",
        "value": "My Store",
        "style": {
          "align": "center",
          "bold": true,
          "fontScale": 1.5
        }
      },
      {
        "type": "divider",
        "style": {
          "lineStyle": "dashed"
        }
      },
      {
        "type": "table",
        "headers": ["Item", "Qty", "Price", "Total"],
        "rows": [
          ["Product 1", "2", "$10.00", "$20.00"],
          ["Product 2", "1", "$15.50", "$15.50"]
        ],
        "style": {
          "columnAligns": ["left", "center", "right", "right"]
        }
      },
      {
        "type": "spacer",
        "height": 20
      }
    ]
  },
  "options": {
    "printerName": "POS-80C",
    "paperSize": "80mm",
    "fontSize": 12,
    "fontScale": 1.2,
    "copies": 1
  }
}
```

**Available Block Types:**

1. **Text Block**

```json
{
  "type": "text",
  "value": "Your text here",
  "style": {
    "align": "left|center|right",
    "bold": true,
    "fontSize": 14,
    "fontScale": 1.2,
    "marginTop": 10,
    "marginBottom": 10
  }
}
```

**Line Breaks:** Use `\n` in text values to create line breaks:

```json
{
  "type": "text",
  "value": "Store Name\nCity, State\nPhone: (555) 123-4567",
  "style": {
    "align": "center"
  }
}
```

2. **Table Block**

```json
{
  "type": "table",
  "headers": ["Col1", "Col2"],
  "rows": [["Data1", "Data2"]],
  "style": {
    "columnAligns": ["left", "right"],
    "headerBold": true,
    "fontScale": 1.0
  }
}
```

**Full-Width Rows in Tables:**

Tables now support full-width rows for lengthy content like product names. Simply use a string instead of an array for that row:

```json
{
  "type": "table",
  "headers": ["Qty", "Price", "Total"],
  "rows": [
    "Product Name Test 1",
    ["1", "160.00", "160.00"],
    "Product Name Test 2 - Very Long Product Name That Needs Full Width",
    ["2", "160.00", "320.00"]
  ],
  "style": {
    "columnAligns": ["center", "right", "right"],
    "fullWidthRowAlign": "left"
  }
}
```

In this example:
- String rows (`"Product Name Test 1"`) span across all columns with full width
- Array rows (`["1", "160.00", "160.00"]`) display as normal table cells
- `fullWidthRowAlign` controls the alignment of full-width rows (default: "left")
- Line breaks (`\n`) are supported in all text, including table cells and full-width rows

3. **Divider Block**

```json
{
  "type": "divider",
  "style": {
    "lineStyle": "solid|dashed|dotted",
    "marginTop": 5,
    "marginBottom": 5
  }
}
```

4. **Spacer Block**

```json
{
  "type": "spacer",
  "height": 20
}
```

5. **Image Block**

```json
{
  "type": "image",
  "url": "data:image/png;base64,...",
  "style": {
    "align": "center",
    "width": 200,
    "height": 100
  }
}
```

6. **Barcode Block**

```json
{
  "type": "barcode",
  "value": "1234567890",
  "barcodeType": "CODE128",
  "style": {
    "align": "center",
    "width": 200,
    "height": 50,
    "displayValue": true,
    "fontSize": 12,
    "marginTop": 10,
    "marginBottom": 10
  }
}
```

**Note on Barcode Width:**
- If `width` is not specified, the barcode automatically scales to 80% of the paper's usable width
- For 80mm paper: ~217px default width
- For 58mm paper: ~151px default width
- For 44mm paper: ~109px default width
- You can override with a custom `width` value if needed
- `max-width: 100%` ensures barcodes never overflow the paper

**Supported Barcode Types:**
- `CODE128` (default) - Universal, supports alphanumeric
- `EAN13` - European Article Number (13 digits)
- `EAN8` - European Article Number (8 digits)
- `UPC` - Universal Product Code
- `CODE39` - Alphanumeric barcode
- `ITF14` - Interleaved 2 of 5 (14 digits)
- `MSI` - Modified Plessey
- `pharmacode` - Pharmaceutical Binary Code

**Example with barcode in a receipt:**

```json
{
  "document": {
    "blocks": [
      {
        "type": "text",
        "value": "Order #12345",
        "style": { "align": "center", "bold": true }
      },
      {
        "type": "barcode",
        "value": "12345",
        "barcodeType": "CODE128",
        "style": {
          "align": "center",
          "width": 200,
          "height": 50
        }
      },
      {
        "type": "divider"
      }
    ]
  }
}
```

## Building for Windows

### Local Build

```bash
npm run package:win
```

The installer will be created in the `release/` directory.

### GitHub Actions Build

1. Push your code to GitHub
2. The workflow will automatically build on push to `main` branch
3. For releases, create a git tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. The workflow will create a GitHub release with the installer

## Integration Example

### Legacy Receipt Format (Simple)

```javascript
// Print a receipt with options
const printResponse = await fetch("http://localhost:3456/api/print", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    printerId: selectedPrinterId,
    receipt: {
      storeName: "My Store",
      items: [
        /* ... */
      ],
      total: 39.05,
    },
    options: {
      paperSize: "80mm", // Paper size
      fontScale: 1.2, // 120% font size
    },
  }),
});
```

### Advanced Document Format (Full Control)

```javascript
// Print with advanced formatting
const printResponse = await fetch("http://localhost:3456/api/print-document", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    document: {
      blocks: [
        {
          type: "text",
          value: "My Store",
          style: { align: "center", bold: true, fontScale: 1.5 },
        },
        { type: "divider" },
        {
          type: "table",
          headers: ["Item", "Qty", "Price", "Total"],
          rows: [["Product 1", "2", "$10.00", "$20.00"]],
          style: {
            columnAligns: ["left", "center", "right", "right"],
          },
        },
      ],
    },
    options: {
      printerName: selectedPrinterId,
      paperSize: "80mm",
      fontScale: 1.2, // 120% font size
      copies: 1,
    },
  }),
});
```

## System Requirements

- Windows 10 or later
- Thermal printer with Windows drivers installed (80mm or 58mm)
- **Works with all thermal printer brands** including:
  - XPrint / XP-series printers
  - EPSON thermal printers
  - Star Micronics printers
  - Generic ESC/POS printers
  - Any Windows-compatible thermal printer

## Troubleshooting

### Printer Not Found

- Ensure the printer is properly installed and has Windows drivers
- Check that the printer is powered on and connected
- Verify the printer name matches exactly (case-sensitive)

### Print Job Not Executing

- Check if the printer is set as the default printer
- Ensure the printer is not in error state or out of paper
- Verify printer drivers are up to date

## License

MIT
