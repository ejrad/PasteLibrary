# PasteLibrary 📋

A cross-browser extension (Chrome & Firefox Manifest V3) to input any GitHub repository, browse folders and whitelisted text files, preview with syntax highlighting, and automatically copy code to your clipboard.

## Features

- **GitHub Repo Input**: Paste any GitHub repo URL (`https://github.com/owner/repo`, tree/branch URLs, or `owner/repo`).
- **Interactive Directory Explorer**:
  - Traverses folders with breadcrumb navigation and parent folder shortcut.
  - Whitelists only text files (over 100+ code, markup, config, and plain text formats).
  - Filters out binary, image, and archive files.
  - Search filter to quickly locate files in the current folder.
- **Scrollable Code Preview**:
  - Syntax highlighting for code, configs, and markup.
  - Line numbers gutter.
  - Automatic code text selection/highlighting on file click.
- **Instant Clipboard Integration**:
  - Automatically copies the file content to clipboard on click (toggleable).
  - Manual "Copy" and "Select All" buttons with toast feedback.
- **Cross-Browser & Rate Limit Support**:
  - Compatible with Chrome and Firefox.
  - Displays remaining GitHub API rate limits.
  - Optional Personal Access Token (PAT) support for private repositories and higher rate limits (5,000 req/hr).

## Installation

### Google Chrome / Chromium / Edge / Brave
1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select this directory (`pastelib`).

### Mozilla Firefox
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` in this directory (`pastelib`).

## Project Architecture

```
pastelib/
├── manifest.json            # Cross-browser Manifest V3 config
├── popup.html               # Popup view layout
├── popup.css                # Dark developer theme styling
├── popup.js                 # Popup controller & state management
├── modules/
│   ├── fileTypes.js         # Text file whitelist & language detection
│   ├── githubApi.js         # GitHub REST API client & URL parser
│   ├── clipboard.js         # Clipboard & text selection utilities
│   ├── storage.js           # Cross-browser storage abstraction
│   └── highlighter.js       # Safe syntax highlighting & line numbers
├── icons/                   # Extension icons (16, 48, 128)
└── tests/                   # Module tests
```
