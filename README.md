K-Scope

A minimal, high-performance quick launcher for Windows built with Tauri and Svelte. It sits in the background and overlays on top of your current window when triggered.
Features

    Universal Launching: Supports multiple entry types:

        Steam Games: Auto-launches via Steam App ID.

        Executables: Runs .exe files (supports custom launch arguments).

        Websites: Opens URLs in your default browser.

        Scripts: Runs .bat and .cmd files.

    Keyboard First: Fully navigable without a mouse.

    Theming: Includes a dark "Tech" mode and a high-contrast "Paper" mode.

    CRUD Support: Add, edit, and delete entries directly from the UI.

    Performance: Built on Rust (Tauri), using significantly less RAM than Electron alternatives.

Controls
Key Action
Ctrl + Shift + F12 Toggle Window (Global Hotkey)
Arrow Keys Navigate grid
Enter Launch selected item
Tab Switch between Games and Apps tabs
Esc Close window

nstallation

    Download the latest .exe from the Releases tab.

    Run the installer.

    Press Ctrl + Shift + F12 to open.

Usage
Adding Entries

Navigate to the Add tab and select your entry type:

    Steam: Input the Steam App ID (found in the store URL, e.g., store.steampowered.com/app/1245620).

    Exe: Browse for the executable path. You can add optional launch arguments (e.g., --fullscreen).

    URL: Input the full http/https link.

    Batch: Browse for the script file.

Editing & Deleting

Hover over any card to reveal the Edit (pencil) and Delete (trash) buttons.

    Edit: Populates the Add form with existing data for modification.

    Delete: Removes the entry from the local SQLite database.

Development

To build the project locally:

Prerequisites

    Node.js

    Rust / Cargo

    Tauri Build Tools (C++ Build Tools, WebView2)

Setup
Bash

# Install dependencies

npm install

# Run in dev mode (hot reload)

npm run tauri dev

# Build production executable

npm run tauri build

The compiled installer will be located in src-tauri/target/release/bundle/nsis/.
Stack

    Frontend: Svelte 5, TypeScript

    Backend: Rust (Tauri)

    Database: SQLite (@tauri-apps/plugin-sql)
