# Lotus — desktop (portable Windows build)

Lotus prices tonight's real Mega Millions or Powerball ticket after the jackpot
split and tax, straight from the official advertised jackpot. The draws are
random — this is an honest math tool, not a way to win.

This is the standalone desktop build carved out of LittleBrother: a Vite + React
app wrapped in Electron. When it launches, the Electron (Node) side fetches the
official Powerball / Mega Millions jackpots so the **Live / Offline** banner is
truthful on any machine; if the feeds can't be reached it shows the last jackpot
baked into the build and says so.

## Build
```
npm install
npm run dist      # -> release/Lotus-1.0.0-portable.exe
```
CI (`.github/workflows/build.yml`) builds the portable `.exe` on a Windows runner
and uploads it as the **Lotus-portable-exe** artifact on each push to `main`.
