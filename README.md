# chrome-keep-last-tab

A tiny Chrome extension that **stops Chrome from closing the last window when you close its last tab** (Cmd+W / Ctrl+W). Instead of the window disappearing, you land on the New Tab page or a start page of your choice.

No data collection, no network requests, no toolbar UI. Manifest V3, about 150 lines of plain JavaScript.

## Why

Chrome closes a window as soon as its last tab is closed, and an extension cannot intercept Cmd+W. If you close tabs quickly, you often close the whole browser window by accident.

## How it works

- While only one normal window is open, the extension keeps a small **guard tab** pinned on the left. It is inactive and already shows your start page.
- When you close the last regular tab, a fresh guard is added first, then the old guard is unpinned and becomes the page you see. A guard therefore always exists before the next Cmd+W, even when you press it quickly.
- Switching to the guard (for example with Cmd+1) does not change it. If you browse in it or unpin it, it becomes a normal tab and a new guard is added.
- With two or more windows open, guards are removed: closing the last tab of a window then closes that window as usual.
- The extension never closes tabs it did not create in the current session. A guard restored by Chrome from a previous session is left alone.

## Install

1. Download or clone this repository and keep the folder somewhere permanent.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.

## Start page

By default the guard shows Chrome's New Tab page (or whatever New Tab extension you use). Extensions cannot read Chrome's own homepage setting, so to use a specific page open the extension's **Options** (`chrome://extensions` → Details → Extension options) and enter a URL.

## Limitations

- A pinned guard tab is visible while only one window is open.
- Extremely fast key repeats can, in rare cases, still outrun Chrome's event handling.

## License

MIT
