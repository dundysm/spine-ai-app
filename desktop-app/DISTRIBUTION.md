# Spine AI — Distribution Guide

## Building the Installer

### Method 1: Using Build Script (Recommended)

1. Open a terminal in the `desktop-app` folder.
2. Run:
   ```bat
   build-installer.bat
   ```
3. When it finishes, the installer is at:
   ```
   desktop-app\installer\Spine-AI-Setup-1.0.0.exe
   ```
4. Share that single `.exe` file with users.

### Method 2: Using npm Scripts

1. Install dependencies (once):
   ```bash
   npm install
   ```
2. Build the installer:
   ```bash
   npm run dist
   ```
3. Output: `installer\Spine-AI-Setup-1.0.0.exe`

### Method 3: Portable Build (no installer)

To create a portable `.exe` that runs without installing:

```bash
npm run dist:portable
```

Output will be in `installer\` (e.g. `Spine AI 1.0.0.exe`). Users can copy the folder anywhere and run the exe.

---

## What the Installer Does

- **Single file:** User downloads `Spine-AI-Setup-1.0.0.exe` only.
- **Double-click:** Standard Windows NSIS installer opens.
- **Install location:** User can choose; default is `C:\Program Files\Spine AI`.
- **Shortcuts:** Desktop shortcut and Start menu entry named "Spine AI".
- **Uninstall:** Via **Settings → Apps → Spine AI → Uninstall** (or Add/Remove Programs).
- **Elevation:** Installer requests admin rights when needed (e.g. Program Files).
- **DICOM association:** Option to associate `.dcm` files with Spine AI (file associations).

---

## Before Building

1. **Backend API:** The desktop app expects the Spine AI backend at `http://127.0.0.1:8001`. End users must run the backend separately (or you provide a way to start it). The installer can bundle backend files under `extraResources`; starting that backend is separate (e.g. a launcher script or service).
2. **Icon:** Ensure `electron/icon.ico` and `electron/icon.png` exist (use your own if you change the app icon).
3. **Version:** Edit `version` in `desktop-app/package.json` to change the installer filename and app version.

---

## File Layout After Build

```
desktop-app/
├── installer/
│   └── Spine-AI-Setup-1.0.0.exe   ← Share this file
├── dist/                          (Vite output, used by electron-builder)
└── ...
```

---

## Troubleshooting

- **"electron-builder not found"** — Run `npm install` in `desktop-app`.
- **"icon.ico not found"** — Add `electron/icon.ico` and `electron/icon.png` (e.g. export from your logo).
- **Build fails on "rimraf"** — Run `npm install`; `rimraf` is in devDependencies.
- **Installer runs but app won’t connect** — Backend must be running on `http://127.0.0.1:8001` (see main project README for backend setup).
- **Desktop shortcut shows default Electron icon** — Ensure `electron/icon.ico` is present before building. Rebuild the installer, uninstall the old app, and install the new one. If the shortcut still shows the old icon, delete it and create a new one from the Start menu (right‑click **Spine AI** → **Send to** → **Desktop**), or restart Windows Explorer to refresh the icon cache.
