const { contextBridge } = require("electron");

// main.cjs passes the live jackpot payload as a base64 argv entry; decode and expose it as
// window.LOTUS_CURRENT so DrawValueTool can read it synchronously at module-eval time.
let data = null;
const arg = process.argv.find((a) => a.startsWith("--lotus-current="));
if (arg) {
  try {
    const json = Buffer.from(arg.slice("--lotus-current=".length), "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && (parsed.powerball || parsed.megamillions)) data = parsed;
  } catch (_) {
    data = null;
  }
}
contextBridge.exposeInMainWorld("LOTUS_CURRENT", data);
