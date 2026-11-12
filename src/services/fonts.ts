import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { FontFamily } from "../types/printer.types";

type Subset = "latin" | "sinhala";

// Character ranges of the Fontsource subset files, so the browser picks the
// Latin or Sinhala file per character.
const SUBSET_RANGES: Record<Subset, string> = {
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  sinhala: "U+0964-0965, U+0D81-0DF4, U+1CF2, U+200C-200D, U+25CC, U+111E1-111F4",
};

const WEIGHTS = [400, 700] as const;

interface FontDefinition {
  label: string; // Human-readable name for POS settings screens
  cssName: string; // Family name used in CSS
  source: "bundled" | "system"; // Shipped with the bridge, or installed with Windows
  generic: "monospace" | "sans-serif" | "serif"; // Last-resort CSS fallback
  sinhala: boolean; // Has Sinhala glyphs
  // Bundled fonts only: files are named `<key>-<subset>-<weight>-normal.woff2`
  subsets?: Subset[];
}

export const DEFAULT_FONT: FontFamily = "roboto-mono";

// Sinhala text in a font without Sinhala glyphs is drawn in this font.
const SINHALA_FALLBACK: FontFamily = "noto-sans-sinhala";

const bundledLatin = (label: string, generic: FontDefinition["generic"]): FontDefinition => ({
  label,
  cssName: label,
  source: "bundled",
  generic,
  sinhala: false,
  subsets: ["latin"],
});

const bundledSinhala = (label: string, generic: FontDefinition["generic"]): FontDefinition => ({
  label,
  cssName: label,
  source: "bundled",
  generic,
  sinhala: true,
  subsets: ["latin", "sinhala"],
});

const system = (
  label: string,
  generic: FontDefinition["generic"],
  sinhala = false
): FontDefinition => ({ label, cssName: label, source: "system", generic, sinhala });

// Fonts the POS can choose from, by key. Bundled fonts render the same on
// every machine; system fonts come with Windows 10/11 and are used by name.
export const FONTS: Record<FontFamily, FontDefinition> = {
  "roboto-mono": bundledLatin("Roboto Mono", "monospace"),
  "courier-prime": bundledLatin("Courier Prime", "monospace"),
  "ibm-plex-mono": bundledLatin("IBM Plex Mono", "monospace"),
  "jetbrains-mono": bundledLatin("JetBrains Mono", "monospace"),
  "source-code-pro": bundledLatin("Source Code Pro", "monospace"),
  inconsolata: bundledLatin("Inconsolata", "monospace"),
  inter: bundledLatin("Inter", "sans-serif"),
  "roboto-condensed": bundledLatin("Roboto Condensed", "sans-serif"),
  "noto-sans-sinhala": bundledSinhala("Noto Sans Sinhala", "sans-serif"),
  "noto-serif-sinhala": bundledSinhala("Noto Serif Sinhala", "serif"),
  "abhaya-libre": bundledSinhala("Abhaya Libre", "serif"),
  yaldevi: bundledSinhala("Yaldevi", "sans-serif"),
  "gemunu-libre": bundledSinhala("Gemunu Libre", "sans-serif"),
  consolas: system("Consolas", "monospace"),
  "courier-new": system("Courier New", "monospace"),
  "lucida-console": system("Lucida Console", "monospace"),
  arial: system("Arial", "sans-serif"),
  calibri: system("Calibri", "sans-serif"),
  "segoe-ui": system("Segoe UI", "sans-serif"),
  tahoma: system("Tahoma", "sans-serif"),
  verdana: system("Verdana", "sans-serif"),
  "trebuchet-ms": system("Trebuchet MS", "sans-serif"),
  "times-new-roman": system("Times New Roman", "serif"),
  georgia: system("Georgia", "serif"),
  "nirmala-ui": system("Nirmala UI", "sans-serif", true),
};

const SINHALA_CHARS = /[඀-෿]/;

const base64Cache = new Map<string, string>();

function fontsDir(): string {
  // In production, fonts are in extraResources
  // In development, fonts are in the assets folder
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", "fonts")
    : path.join(__dirname, "..", "..", "assets", "fonts");
}

function readFontBase64(file: string): string {
  const cached = base64Cache.get(file);
  if (cached !== undefined) return cached;

  let data = "";
  try {
    const fontPath = path.join(fontsDir(), file);
    if (fs.existsSync(fontPath)) {
      data = fs.readFileSync(fontPath).toString("base64");
    } else {
      console.error(`Font file not found: ${fontPath}`);
    }
  } catch (error) {
    console.error(`Failed to load font ${file}:`, error);
  }
  base64Cache.set(file, data);
  return data;
}

/** Warm the cache for the always-embedded default font. */
export function loadFonts(): void {
  WEIGHTS.forEach((w) => readFontBase64(`${DEFAULT_FONT}-latin-${w}-normal.woff2`));
}

/** Resolves a requested key to a known font, falling back to the default. */
export function resolveFont(key: string | undefined): FontFamily {
  if (!key) return DEFAULT_FONT;
  const normalized = key.trim().toLowerCase() as FontFamily;
  if (normalized in FONTS) return normalized;
  console.warn(`Unknown fontFamily "${key}", using "${DEFAULT_FONT}"`);
  return DEFAULT_FONT;
}

/**
 * CSS font-family list for a font key. Sinhala text falls back to Noto Sans
 * Sinhala when the chosen font has no Sinhala glyphs.
 */
export function getFontStack(key: FontFamily): string {
  const font = FONTS[key];
  const stack = [`'${font.cssName}'`];
  if (!font.sinhala) stack.push(`'${FONTS[SINHALA_FALLBACK].cssName}'`);
  if (key !== DEFAULT_FONT) stack.push(`'${FONTS[DEFAULT_FONT].cssName}'`);
  stack.push(font.generic === "monospace" ? "'Courier New', Courier, monospace" : font.generic);
  return stack.join(", ");
}

export function containsSinhala(text: string): boolean {
  return SINHALA_CHARS.test(text);
}

/**
 * @font-face rules for the bundled fonts a document uses. Roboto Mono is always
 * included; Sinhala files only when the document has Sinhala text, keeping
 * receipts small.
 */
export function getFontFaceCSS(usedFonts: Iterable<FontFamily> = [], hasSinhala = false): string {
  const used = new Set(usedFonts);
  const keys = new Set<FontFamily>([DEFAULT_FONT, ...used]);
  // The fallback is only needed when a font in use has no Sinhala glyphs.
  if (hasSinhala && [...used].some((k) => !FONTS[k].sinhala)) keys.add(SINHALA_FALLBACK);

  let css = "";
  keys.forEach((key) => {
    const font = FONTS[key];
    if (font.source !== "bundled" || !font.subsets) return;
    // The fallback font is only there for Sinhala; its Latin files are unused
    // unless the document picked it.
    const subsets = font.subsets.filter(
      (s) => (s === "sinhala" ? hasSinhala : key !== SINHALA_FALLBACK || used.has(key))
    );
    subsets.forEach((subset) =>
      WEIGHTS.forEach((weight) => {
        const data = readFontBase64(`${key}-${subset}-${weight}-normal.woff2`);
        if (!data) return;
        css += `
    @font-face {
      font-family: '${font.cssName}';
      font-style: normal;
      font-weight: ${weight};
      src: url(data:font/woff2;base64,${data}) format('woff2');
      unicode-range: ${SUBSET_RANGES[subset]};
    }
`;
      })
    );
  });
  return css;
}

/** Font list for POS settings screens. */
export function listFonts() {
  return (Object.keys(FONTS) as FontFamily[]).map((key) => ({
    key,
    label: FONTS[key].label,
    source: FONTS[key].source,
    monospace: FONTS[key].generic === "monospace",
    sinhala: FONTS[key].sinhala,
    default: key === DEFAULT_FONT,
  }));
}
