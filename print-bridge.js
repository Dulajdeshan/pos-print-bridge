const express = require("express");
const escpos = require("escpos");
const usb = require("usb");

escpos.USB = require("escpos-usb");

const PORT = 9000;

/* ---------- USB PRINTER DISCOVERY ---------- */

function isUsbPrinterDevice(device) {
  try {
    return device.configDescriptor.interfaces.some((iface) =>
      iface.some((alt) => alt.bInterfaceClass === 0x07)
    );
  } catch {
    return false;
  }
}

function getStringDescriptorSafe(device, index) {
  return new Promise((resolve) => {
    if (!index) return resolve(null);
    device.getStringDescriptor(index, (err, str) => resolve(err ? null : str));
  });
}

async function describeUsbDevice(device) {
  const dd = device.deviceDescriptor;
  let manufacturer = null;
  let product = null;
  let serial = null;

  try {
    device.open();
    manufacturer = await getStringDescriptorSafe(device, dd.iManufacturer);
    product = await getStringDescriptorSafe(device, dd.iProduct);
    serial = await getStringDescriptorSafe(device, dd.iSerialNumber);
  } catch {
  } finally {
    try {
      device.close();
    } catch {}
  }

  return {
    id: `usb-${dd.idVendor}:${dd.idProduct}-${device.busNumber}-${device.deviceAddress}`,
    name: product || "USB Receipt Printer",
    manufacturer,
    serial,
  };
}

async function discoverPrinters() {
  const devices = usb.getDeviceList().filter(isUsbPrinterDevice);
  return Promise.all(devices.map(describeUsbDevice));
}

/* ---------- PRINT LOGIC ---------- */

function printReceipt(data, callback) {
  try {
    const device = new escpos.USB();
    const printer = new escpos.Printer(device);

    device.open((err) => {
      if (err) return callback(err);

      printer
        .text("=== RECEIPT ===")
        .text(`Items: ${data.items?.join(", ") || "-"}`)
        .text(`Total: ${data.total}`)
        .cut()
        .close();

      callback(null);
    });
  } catch (err) {
    callback(err);
  }
}

/* ---------- EXPRESS SERVER ---------- */

function startPrintBridge() {
  const app = express();
  app.use(express.json());

  app.get("/printers", async (_, res) => {
    try {
      res.json(await discoverPrinters());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/print", async (req, res) => {
    const { printerId, data } = req.body;
    const printers = await discoverPrinters();

    const printer = printers.find(
      (p) => p.id === printerId || p.serial === printerId
    );

    if (!printer) {
      return res.status(400).json({ error: "Printer not found" });
    }

    printReceipt(data, (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ status: "printed", printer: printer.name });
    });
  });

  app.listen(PORT, () => {
    console.log(`🖨️ Print Bridge running at http://localhost:${PORT}`);
  });
}

module.exports = { startPrintBridge };
