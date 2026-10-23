const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { refreshCurrent } = require("./refresh.cjs");

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
  await win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(async () => {
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
