import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  protocol,
  net,
} from "electron";
import * as path from "path";
import { startServer } from "./server";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow() {
  // Show window only if not launched on startup or not packaged
  const shouldShow = !app.isPackaged || !app.getLoginItemSettings().wasOpenedAtLogin;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 440,
    show: shouldShow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const htmlPath = path.join(__dirname, "../index.html");
  mainWindow.loadFile(htmlPath);

  // Open DevTools only in development
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
    return false;
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  // Load the icon from assets folder
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "icon.ico")
    : path.join(__dirname, "..", "assets", "icon.ico");

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show App",
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("POS Printer Bridge");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow?.show();
  });
}

app.whenReady().then(() => {
  // Enable auto-launch on system startup (production only)
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true, // Start minimized to tray
    });
  }

  // Register custom protocol for assets
  protocol.handle("asset", (request) => {
    const url = request.url.replace("asset://", "");
    const assetPath = app.isPackaged
      ? path.join(process.resourcesPath, "assets", url)
      : path.join(__dirname, "..", "assets", url);
    return net.fetch(`file://${assetPath}`);
  });

  createWindow();
  createTray();
  startServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Keep app running in background on all platforms
});

app.on("before-quit", () => {
  isQuitting = true;
});
