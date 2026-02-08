# Spine AI Desktop Application

Windows desktop application for spine MRI AI analysis. Opens to the **worklist** by default, with system tray support and one-click **Copy to PowerScribe** clipboard integration.

## Prerequisites

- **Backend** must be running on `http://127.0.0.1:8001` (FastAPI). Start it from the `backend/` folder (e.g. `uvicorn main:app --reload --host 127.0.0.1 --port 8001`).
- Node.js 18+ and npm.

## Development

```bash
cd desktop-app
npm install
npm run electron:dev
```

This starts the Vite dev server and launches Electron. The app loads from `http://localhost:5173`. Ensure the backend is running so the worklist and study/report APIs work.

## Build installer

```bash
npm run dist
```

Creates the Windows installer in the `installer/` folder (e.g. `Spine-AI-Setup-1.0.0.exe`).

## Installation (end user)

1. Run **Spine-AI-Setup-1.0.0.exe** from the `installer/` folder (or the built installer you have).
2. Follow the installer (you can choose installation directory).
3. Desktop and Start menu shortcuts are created.
4. Launch **Spine AI**; the system tray icon appears (bottom-right).

## Usage

- **Default view:** Worklist (studies ready for review from Orthanc + auto-analyzer).
- Click a study to open it: viewer on the left, report on the right.
- **Copy to PowerScribe:** Click the green button to copy the current report to the clipboard; paste into PowerScribe with **Ctrl+V**.
- **Approve:** Use “Approve study” when done reviewing.
- **Minimize to tray:** Closing the window (X) hides the app to the system tray. Double-click the tray icon or choose “Show Spine AI” to restore.
- **Manual upload:** Expand “Upload study (manual)” on the worklist screen to drag-and-drop DICOM files.

## Keyboard shortcuts

- **Ctrl+Shift+S** — Show or focus the app window (global).
- **Ctrl+Shift+C** — Copy current report to clipboard (when a report is open).
- **?** — Show shortcuts help.
- **U** — Toggle upload panel (on worklist view).
- **← / →** or **J / K** — Previous/next DICOM slice (when viewer is focused).

## Single instance

Only one instance of Spine AI can run at a time. Starting a second one focuses the existing window.

## Requirements

- Windows 10/11.
- Backend API running on the same machine at `http://127.0.0.1:8001` (configure Orthanc, auto-analyzer, and API as per the main project README).
