// electron-builder configuration.
//
// Moved out of package.json so the auto-update feed URL can be wired up
// conditionally from an environment variable at build time.
//
// R2_PUBLIC_URL is the public base URL of the Cloudflare R2 bucket that hosts
// the release artifacts (installer, blockmap, latest.yml). When it is set, the
// generic auto-update feed is baked into the packaged app's app-update.yml and
// electron-updater will check <R2_PUBLIC_URL>/releases for new versions.
// Leave it unset to build a one-off installer with no auto-update.

const r2PublicUrl = process.env.R2_PUBLIC_URL;

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.yourcompany.posprinterbridge",
  productName: "POS Printer Bridge",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "index.html", "package.json"],
  extraResources: [
    {
      from: "assets",
      to: "assets",
      filter: ["**/*"],
    },
  ],
  // Generic auto-update feed hosted on R2. Only configured when the public URL
  // is available so local/unsigned builds still succeed without it.
  publish: r2PublicUrl
    ? [
        {
          provider: "generic",
          url: `${r2PublicUrl}/pos-printer-bridge/releases`,
        },
      ]
    : null,
  win: {
    target: ["nsis"],
    icon: "assets/icon.ico",
    publisherName: "Benzene POS Solutions",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    installerIcon: "assets/icon.ico",
    uninstallerIcon: "assets/icon.ico",
    displayLanguageSelector: false,
  },
  mac: {
    target: ["dmg", "zip"],
    icon: "assets/icon.ico",
    category: "public.app-category.business",
  },
  linux: {
    target: ["AppImage", "deb"],
    icon: "assets/icon.ico",
    category: "Office",
  },
};
