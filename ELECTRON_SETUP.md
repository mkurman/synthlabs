# Electron Desktop App Setup Guide

## Overview

This project now includes full Electron support for building standalone desktop applications for Windows, macOS, and Linux.

## What Was Added

### 1. Core Files

- **electron/main.js** - Main Electron process
  - Window management (creation, sizing, behavior)
  - Menu configuration with native menus
  - Security settings (context isolation, disabled node integration)
  - IPC handlers for renderer-main communication
  - Platform-specific handling (macOS vs Windows vs Linux)

- **electron/preload.js** - Preload script
  - Exposes safe API to renderer via contextBridge
  - Provides version info and platform detection

- **build/entitlements.mac.plist** - macOS code signing entitlements
  - Required for network access
  - Enables JIT for V8
  - Hardened runtime support

### 2. Configuration Updates

**package.json:**
- Added `"main": "electron/main.js"` entry point
- Added Electron scripts:
  - `electron:dev` - Development mode with hot reload
  - `electron:build` - Build for all platforms
  - `electron:build:win` - Windows-specific build
  - `electron:build:mac` - macOS-specific build
- Added electron-builder configuration for all platforms
- Added dependencies: electron, electron-builder, concurrently, wait-on, electron-is-dev

**vite.config.ts:**
- Changed server port from 3000 to 5173 (Electron default)
- Added `base: './'` for file:// protocol support

**types.ts:**
- Added ElectronAPI interface for type-safe renderer communication

**.gitignore:**
- Added `release/` to ignore built binaries

### 3. Build Targets

**Windows (x64):**
- NSIS installer (`.exe`) with customization options
- Portable executable (`.exe`)

**macOS (x64 + arm64):**
- DMG disk image (`.dmg`)
- ZIP archive (`.zip`)
- Code signing with hardened runtime

**Linux:**
- AppImage (universal)
- Debian/Ubuntu package (`.deb`)

## Usage

### Development

```bash
npm run electron:dev
```

This starts:
1. Vite dev server on http://localhost:5173
2. Electron window loading the dev server
3. Hot reload enabled

### Building for Production

**All platforms:**
```bash
npm run electron:build
```

**Windows only:**
```bash
npm run electron:build:win
```

**macOS only:**
```bash
npm run electron:build:mac
```

### Output Location

All built applications are placed in the `release/` directory.

## Platform-Specific Requirements

### Windows
- Windows 10 or later
- No additional dependencies
- Builds run on Windows or can be cross-compiled from Linux/macOS

### macOS
- macOS 10.15 (Catalina) or later
- Xcode Command Line Tools: `xcode-select --install`
- For App Store distribution: Apple Developer account
- For signed distribution outside App Store: Apple Developer certificate

### Linux
- Any modern distribution
- Build tools: `sudo apt-get install build-essential`

## Security Features

- **Context Isolation**: Enabled (prevents prototype pollution)
- **Node Integration**: Disabled in renderer
- **Content Security Policy**: Configurable in electron/main.js
- **Preload Script**: Secure API exposure
- **Electron Security Best Practices**: Following official guidelines

## Troubleshooting

### Build Fails on Windows
- Ensure Windows SDK is installed
- Run as administrator if permission errors occur
- Check that no instances of the app are running

### Build Fails on macOS
- Install Xcode Command Line Tools: `xcode-select --install`
- Ensure code signing certificates are set up (for distribution)
- Check macOS version compatibility

### "File not found" errors
- Ensure `dist/` directory exists (run `npm run build` first)
- Check that all files are included in electron-builder config

### App doesn't start
- Check console logs in DevTools (in development mode)
- Verify all API keys are properly configured in .env.local
- Check that required services are accessible

## Distribution

### Unsigned (Development/Testing)
- Builds work out of the box for testing
- macOS will show "unidentified developer" warning
- Right-click → Open on macOS to bypass (once)

### Signed (Production)
- Requires Apple Developer certificate (macOS)
- Requires code signing certificate (Windows)
- Configure in electron-builder options:
  ```json
  "mac": {
    "identity": "Developer ID Application: Your Name"
  }
  ```

## Architecture

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│  (electron/main.js)                      │
│  - Window management                    │
│  - OS integration                        │
│  - Security                              │
└─────────────────────────────────────────┘
                    ↕ IPC
┌─────────────────────────────────────────┐
│          Preload Script                 │
│  (electron/preload.js)                  │
│  - ContextBridge API                    │
│  - Secure communication                 │
└─────────────────────────────────────────┘
                    ↕ Exposed API
┌─────────────────────────────────────────┐
│         Renderer Process                │
│  (Your React app)                       │
│  - UI/UX                                │
│  - Business logic                       │
│  - API calls to AI providers            │
└─────────────────────────────────────────┘
```

## Next Steps

1. **Test locally**: Run `npm run electron:dev` to verify everything works
2. **Build for your platform**: Run the appropriate build command
3. **Test the built app**: Install/run the output from `release/`
4. **Customize appearance**: Modify icon, window size, branding in electron/main.js
5. **Configure code signing**: Set up certificates for production builds
6. **Distribute**: Share the built installers with users

## Support

For issues specific to Electron or electron-builder, refer to:
- Electron docs: https://www.electronjs.org/docs
- electron-builder docs: https://www.electron.build/
