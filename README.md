# PasteLibrary

A cross-browser extension (Chrome and Firefox, Manifest V3) for browsing GitHub repositories, previewing text files, and copying code directly to your clipboard.

## Features

- **Single-request tree loading**: Accepts `owner/repo` shorthands or full GitHub URLs (including branch and subfolder links). Loads the repository tree in one Git Trees API call, so folder navigation runs locally with zero extra API requests. Public file contents are fetched from `raw.githubusercontent.com` without consuming the 60 req/hr REST API quota.
- **Text file whitelist**: Lists folders alongside text files (code, configs, markdown, shell scripts, dotfiles) and filters out binaries, images, and archives. Includes an instant filter box for the current folder.
- **Code blocks as files**: Files containing fenced code blocks (` ``` ` or `~~~`) act as both a file and a folder. Click the row to preview and copy the full file, or click the `📂` button to open it as a folder listing each code block on its own. Isolated headings or labels directly above a block (such as `Elevated PowerShell:` or `### Linux Setup`) become that block's title.
- **Syntax-highlighted preview and auto-copy**: Displays line numbers and syntax highlighting in a scrollable viewer, selects the text, and copies it to your clipboard on click (toggleable in settings).
- **Session persistence**: Saves your repository, current folder (including virtual code-block folders), and selected file when the popup closes so you pick up in the same spot.
- **Optional GitHub token**: Add a Personal Access Token in settings (⚙) for private repositories and a 5,000 req/hr API limit.

## Installation

### Chrome, Edge, and Brave
1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

### Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` in this folder.