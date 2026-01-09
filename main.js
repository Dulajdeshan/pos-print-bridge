const { app, BrowserWindow } = require("electron");
const { startPrintBridge } = require("./print-bridge");

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 220,
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  startPrintBridge(); // 🚀 Start Node.js print bridge
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
