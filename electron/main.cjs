const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { refreshCurrent } = require("./refresh.cjs");

// Serve the built app over a privileged standard scheme so ES-module scripts load
// reliably (file:// can render blank for module scripts in some Electron builds).
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const DIST = path.join(__dirname, "..", "dist");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function serveDist() {
  protocol.handle("app", async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (!rel || rel === "/") rel = "/index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response("forbidden", { status: 403 });
    try {
      const buf = await fs.promises.readFile(file);
      const ext = path.extname(file).toLowerCase();
      return new Response(buf, { headers: { "content-type": MIME[ext] || "application/octet-stream" } });
    } catch (_) {
      return new Response("not found", { status: 404 });
    }
  });
  void net; // net kept available for future remote fetches
  void pathToFileURL;
}

async function createWindow(live) {
  const win = new BrowserWindow({
    width: 1120,
    height: 920,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: "#07070d",
    title: "Lotus",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Hand the freshly-fetched jackpots to the renderer, synchronously, before any page script runs.
      additionalArguments: ["--lotus-current=" + Buffer.from(JSON.stringify(live || {})).toString("base64")],
    },
  });
  win.removeMenu();
  await win.loadURL("app://local/index.html");
}

app.whenReady().then(async () => {
  serveDist();
  let live = null;
  try {
    live = await refreshCurrent(); // fetch tonight's jackpots (Node side = no browser CORS wall)
  } catch (_) {
    live = null;
  }
  await createWindow(live);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(live);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
