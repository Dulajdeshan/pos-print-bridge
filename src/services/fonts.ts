import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

let robotoMono400: string = "";
let robotoMono700: string = "";

export function loadFonts(): void {
  // In production, fonts are in extraResources
  // In development, fonts are in the assets folder
  const fontsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "fonts")
    : path.join(__dirname, "..", "..", "assets", "fonts");

  try {
    const font400Path = path.join(fontsDir, "roboto-mono-latin-400-normal.woff2");
    const font700Path = path.join(fontsDir, "roboto-mono-latin-700-normal.woff2");

    console.log("Loading fonts from:", fontsDir);
    console.log("Font 400 exists:", fs.existsSync(font400Path));
    console.log("Font 700 exists:", fs.existsSync(font700Path));

    if (fs.existsSync(font400Path)) {
      const font400Buffer = fs.readFileSync(font400Path);
      robotoMono400 = font400Buffer.toString("base64");
      console.log("Font 400 loaded, size:", robotoMono400.length);
    }

    if (fs.existsSync(font700Path)) {
      const font700Buffer = fs.readFileSync(font700Path);
      robotoMono700 = font700Buffer.toString("base64");
      console.log("Font 700 loaded, size:", robotoMono700.length);
    }
  } catch (error) {
    console.error("Failed to load fonts:", error);
  }
}

export function getFontFaceCSS(): string {
  if (!robotoMono400 && !robotoMono700) {
    loadFonts();
  }

  return `
    @font-face {
      font-family: 'Roboto Mono';
      font-style: normal;
      font-weight: 400;
      src: url(data:font/woff2;base64,${robotoMono400}) format('woff2');
    }
    
    @font-face {
      font-family: 'Roboto Mono';
      font-style: normal;
      font-weight: 700;
      src: url(data:font/woff2;base64,${robotoMono700}) format('woff2');
    }
  `;
}
