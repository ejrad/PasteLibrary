/**
 * Main Extension Controller for PasteLibrary popup.
 */

import { isTextFile, detectLanguage, getFileExtension } from './modules/fileTypes.js';
import { 
  parseGitHubUrl, 
  fetchRepoInfo, 
  fetchRepoTree,
  fetchDirectoryContents, 
  fetchFileContent,
  GitHubApiError 
} from './modules/githubApi.js';
import { buildTreeIndex, getItemsInPath } from './modules/treeIndex.js';
import { loadSettings, saveSettings, addRecentRepo, saveSession, loadSession } from './modules/storage.js';
import { copyToClipboard, selectElementText, showToast } from './modules/clipboard.js';
import { renderCodeWithLineNumbers, escapeHtml } from './modules/highlighter.js';

// Application State
const state = {
  owner: '',
  repo: '',
  ref: '',
  currentPath: '',
  pathHistory: [],
  currentItems: [],
  activeFile: null,
  activeContent: '',
  treeIndex: null,
  settings: {
    lastRepoUrl: '',
    githubToken: '',
    autoCopy: true,
    recentRepos: []
  }
};

// DOM Elements
const elements = {
  repoUrlInput: document.getElementById('repoUrlInput'),
  loadRepoBtn: document.getElementById('loadRepoBtn'),
  recentChips: document.getElementById('recentChips'),
  toggleSettingsBtn: document.getElementById('toggleSettingsBtn'),
  settingsDrawer: document.getElementById('settingsDrawer'),
  tokenInput: document.getElementById('tokenInput'),
  saveTokenBtn: document.getElementById('saveTokenBtn'),
  autoCopyCheckbox: document.getElementById('autoCopyCheckbox'),
  rateLimitBadge: document.getElementById('rateLimitBadge'),
  breadcrumbBar: document.getElementById('breadcrumbBar'),
  breadcrumbList: document.getElementById('breadcrumbList'),
  upDirBtn: document.getElementById('upDirBtn'),
  fileFilterInput: document.getElementById('fileFilterInput'),
  fileListContainer: document.getElementById('fileListContainer'),
  itemsCountBadge: document.getElementById('itemsCountBadge'),
  activeFileName: document.getElementById('activeFileName'),
  activeFileMeta: document.getElementById('activeFileMeta'),
  codeScrollBox: document.getElementById('codeScrollBox'),
  copyCodeBtn: document.getElementById('copyCodeBtn'),
  highlightAllBtn: document.getElementById('highlightAllBtn'),
  toast: document.getElementById('toastNotification')
};

// Initialize App
async function init() {
  state.settings = await loadSettings();
  elements.tokenInput.value = state.settings.githubToken || '';
  elements.autoCopyCheckbox.checked = state.settings.autoCopy !== false;

  renderRecentChips();
  attachEventListeners();

  // Restore previous session if present
  const session = await loadSession();
  if (session && session.owner && session.repo) {
    elements.repoUrlInput.value = session.repoInput || `https://github.com/${session.owner}/${session.repo}`;
    state.owner = session.owner;
    state.repo = session.repo;
    state.ref = session.ref || 'main';
    state.currentPath = session.currentPath || '';
    if (session.activeFile) {
      state.activeFile = session.activeFile;
    }

    try {
      const treeResult = await fetchRepoTree({
        owner: state.owner,
        repo: state.repo,
        ref: state.ref,
        token: state.settings.githubToken
      });
      state.treeIndex = buildTreeIndex(treeResult.tree, isTextFile);
      updateRateLimit(treeResult.rateLimit);
      loadDirectoryFromIndex(state.currentPath, false);

      if (session.activeFile) {
        await selectFile(session.activeFile, true);
      }
    } catch (err) {
      await loadDirectory(state.currentPath, false);
      if (session.activeFile) {
        await selectFile(session.activeFile, true);
      }
    }
  } else if (state.settings.lastRepoUrl) {
    elements.repoUrlInput.value = state.settings.lastRepoUrl;
  }
}

/**
 * Persists current navigation place (repo, folder, active file).
 */
function persistCurrentSession() {
  if (!state.owner || !state.repo) return;
  saveSession({
    repoInput: elements.repoUrlInput.value,
    owner: state.owner,
    repo: state.repo,
    ref: state.ref,
    currentPath: state.currentPath,
    activeFile: state.activeFile ? {
      name: state.activeFile.name,
      path: state.activeFile.path,
      type: state.activeFile.type,
      size: state.activeFile.size,
      downloadUrl: state.activeFile.downloadUrl
    } : null
  });
}

function attachEventListeners() {
  // Repo load
  elements.loadRepoBtn.addEventListener('click', () => loadRepository(elements.repoUrlInput.value));
  elements.repoUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadRepository(elements.repoUrlInput.value);
  });

  // Settings
  elements.toggleSettingsBtn.addEventListener('click', () => {
    elements.settingsDrawer.classList.toggle('collapsed');
  });

  elements.saveTokenBtn.addEventListener('click', async () => {
    const token = elements.tokenInput.value.trim();
    await saveSettings({ githubToken: token });
    state.settings.githubToken = token;
    showToast(elements.toast, 'Token saved!', 'success');
    elements.settingsDrawer.classList.add('collapsed');
  });

  elements.autoCopyCheckbox.addEventListener('change', async (e) => {
    const autoCopy = e.target.checked;
    await saveSettings({ autoCopy });
    state.settings.autoCopy = autoCopy;
  });

  // Navigation
  elements.upDirBtn.addEventListener('click', navigateUp);
  elements.fileFilterInput.addEventListener('input', () => filterItems(elements.fileFilterInput.value));

  // Preview Actions
  elements.copyCodeBtn.addEventListener('click', handleManualCopy);
  elements.highlightAllBtn.addEventListener('click', handleHighlightAll);
}

/**
 * Loads a GitHub repository from input.
 */
async function loadRepository(input) {
  if (!input || !input.trim()) {
    showToast(elements.toast, 'Please enter a repository URL.', 'error');
    return;
  }

  try {
    const parsed = parseGitHubUrl(input.trim());
    state.owner = parsed.owner;
    state.repo = parsed.repo;
    state.currentPath = parsed.path || '';
    state.ref = parsed.ref || '';

    elements.fileListContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⏳</span>
        <p>Fetching repository tree (1 request)...</p>
      </div>
    `;

    // Fetch repository default branch if not specified
    if (!state.ref) {
      try {
        const repoInfo = await fetchRepoInfo({ 
          owner: state.owner, 
          repo: state.repo, 
          token: state.settings.githubToken 
        });
        state.ref = repoInfo.defaultBranch;
        updateRateLimit(repoInfo.rateLimit);
      } catch (err) {
        // Fallback default
        state.ref = 'main';
      }
    }

    await addRecentRepo(input.trim());
    state.settings.recentRepos = (await loadSettings()).recentRepos;
    renderRecentChips();

    // 1 single request to fetch the entire repository tree
    try {
      const treeResult = await fetchRepoTree({
        owner: state.owner,
        repo: state.repo,
        ref: state.ref,
        token: state.settings.githubToken
      });
      state.treeIndex = buildTreeIndex(treeResult.tree, isTextFile);
      updateRateLimit(treeResult.rateLimit);

      loadDirectoryFromIndex(state.currentPath, true);
    } catch (treeErr) {
      // Fallback if git tree API fails (e.g. empty repo)
      await loadDirectory(state.currentPath, true);
    }
  } catch (err) {
    showToast(elements.toast, err.message, 'error');
    elements.fileListContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Loads directory items instantly from local tree index with zero API calls.
 */
function loadDirectoryFromIndex(path, clearActive = true) {
  state.currentPath = path;
  if (clearActive) {
    state.activeFile = null;
    elements.activeFileName.textContent = 'No file selected';
    elements.activeFileMeta.textContent = '';
    elements.copyCodeBtn.disabled = true;
    elements.highlightAllBtn.disabled = true;
    elements.codeScrollBox.innerHTML = `
      <div class="empty-code-state">
        <p>Click any text file on the left to preview and copy its contents.</p>
      </div>
    `;
  }
  elements.fileFilterInput.value = '';

  const items = getItemsInPath(state.treeIndex, state.currentPath);
  state.currentItems = items;
  renderDirectoryItems(items);
  renderBreadcrumbs();
  elements.breadcrumbBar.style.display = 'flex';
  persistCurrentSession();
}

/**
 * Loads directory contents for given path.
 */
async function loadDirectory(path, clearActive = true) {
  if (state.treeIndex) {
    loadDirectoryFromIndex(path, clearActive);
    return;
  }

  state.currentPath = path;
  if (clearActive) {
    state.activeFile = null;
    elements.activeFileName.textContent = 'No file selected';
    elements.activeFileMeta.textContent = '';
    elements.copyCodeBtn.disabled = true;
    elements.highlightAllBtn.disabled = true;
    elements.codeScrollBox.innerHTML = `
      <div class="empty-code-state">
        <p>Click any text file on the left to preview and copy its contents.</p>
      </div>
    `;
  }
  elements.fileFilterInput.value = '';

  elements.fileListContainer.innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">⏳</span>
      <p>Loading directory items...</p>
    </div>
  `;

  try {
    const result = await fetchDirectoryContents({
      owner: state.owner,
      repo: state.repo,
      path: state.currentPath,
      ref: state.ref,
      token: state.settings.githubToken
    });

    updateRateLimit(result.rateLimit);

    if (result.isFile) {
      // Single file view
      await selectFile(result.items[0]);
      return;
    }

    // Filter: keep folders + whitelisted text files
    const validItems = result.items.filter(item => {
      if (item.type === 'dir') return true;
      if (item.type === 'file') return isTextFile(item.name);
      return false;
    });

    // Sort: directories first, then alphabetical
    validItems.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    state.currentItems = validItems;
    renderDirectoryItems(validItems);
    renderBreadcrumbs();
    elements.breadcrumbBar.style.display = 'flex';
    persistCurrentSession();
  } catch (err) {
    showToast(elements.toast, err.message, 'error');
    elements.fileListContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⚠️</span>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Renders filtered or full list of items in the explorer pane.
 */
function renderDirectoryItems(items) {
  elements.itemsCountBadge.textContent = `${items.length} items`;

  if (items.length === 0) {
    elements.fileListContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📄</span>
        <p>No folders or matching text files found in this directory.</p>
      </div>
    `;
    return;
  }

  elements.fileListContainer.innerHTML = '';

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = `file-item ${item.type === 'dir' ? 'folder-item' : 'code-file-item'}`;
    row.dataset.path = item.path;

    if (state.activeFile && state.activeFile.path === item.path) {
      row.classList.add('selected');
    }

    const iconSpan = document.createElement('span');
    iconSpan.className = 'item-icon';
    iconSpan.textContent = item.type === 'dir' ? '📁' : '📄';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = item.name;

    row.appendChild(iconSpan);
    row.appendChild(nameSpan);

    if (item.type === 'file') {
      const ext = getFileExtension(item.name);
      if (ext) {
        const badge = document.createElement('span');
        badge.className = 'file-badge';
        badge.textContent = ext;
        row.appendChild(badge);
      }
    }

    row.addEventListener('click', () => {
      if (item.type === 'dir') {
        loadDirectory(item.path, true);
      } else {
        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
        row.classList.add('selected');
        selectFile(item, false);
      }
    });

    elements.fileListContainer.appendChild(row);
  });
}

/**
 * Filters current items by query.
 */
function filterItems(query) {
  if (!query || !query.trim()) {
    renderDirectoryItems(state.currentItems);
    return;
  }
  const q = query.trim().toLowerCase();
  const filtered = state.currentItems.filter(item => item.name.toLowerCase().includes(q));
  renderDirectoryItems(filtered);
}

/**
 * Handles selection, preview, syntax highlighting, and auto-copy of a text file.
 */
async function selectFile(item, isRestoring = false) {
  state.activeFile = item;
  elements.activeFileName.textContent = item.name;
  elements.activeFileMeta.textContent = 'Loading...';
  elements.copyCodeBtn.disabled = true;
  elements.highlightAllBtn.disabled = true;

  // Highlight in explorer list if rendered
  document.querySelectorAll('.file-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.path === item.path);
  });

  elements.codeScrollBox.innerHTML = `
    <div class="empty-code-state">
      <p>Fetching file contents...</p>
    </div>
  `;

  try {
    const { content, rateLimit } = await fetchFileContent({
      owner: state.owner,
      repo: state.repo,
      path: item.path,
      ref: state.ref,
      downloadUrl: item.downloadUrl,
      token: state.settings.githubToken
    });

    updateRateLimit(rateLimit);
    state.activeContent = content;

    const lang = detectLanguage(item.name);
    const { html, lineCount } = renderCodeWithLineNumbers(content, lang);

    elements.codeScrollBox.innerHTML = html;
    elements.activeFileMeta.textContent = `(${lineCount} lines, ${formatBytes(item.size || content.length)})`;

    elements.copyCodeBtn.disabled = false;
    elements.highlightAllBtn.disabled = false;

    // Highlight text in the code element
    const codeElement = elements.codeScrollBox.querySelector('.code-body code');
    if (codeElement) {
      selectElementText(codeElement);
    }

    // Auto-copy to clipboard if enabled (and not passively restoring)
    if (state.settings.autoCopy && !isRestoring) {
      const copied = await copyToClipboard(content);
      if (copied) {
        showToast(elements.toast, `✓ Copied "${item.name}" to clipboard!`, 'success');
      } else {
        showToast(elements.toast, 'Loaded file. Click Copy button to copy.', 'info');
      }
    }

    persistCurrentSession();
  } catch (err) {
    showToast(elements.toast, `Failed to load file: ${err.message}`, 'error');
    elements.codeScrollBox.innerHTML = `
      <div class="empty-code-state">
        <p>⚠️ Error: ${escapeHtml(err.message)}</p>
      </div>
    `;
    elements.activeFileMeta.textContent = 'Error';
  }
}

/**
 * Manual copy button click.
 */
async function handleManualCopy() {
  if (!state.activeContent) return;
  const copied = await copyToClipboard(state.activeContent);
  if (copied) {
    showToast(elements.toast, '✓ Copied to clipboard!', 'success');
  } else {
    showToast(elements.toast, 'Could not copy to clipboard.', 'error');
  }
}

/**
 * Highlight / Select All in code preview box.
 */
function handleHighlightAll() {
  const codeElement = elements.codeScrollBox.querySelector('.code-body code');
  if (codeElement) {
    selectElementText(codeElement);
    showToast(elements.toast, 'Text selected', 'info', 1500);
  }
}

/**
 * Breadcrumbs rendering.
 */
function renderBreadcrumbs() {
  elements.breadcrumbList.innerHTML = '';

  // Root crumb
  const rootCrumb = document.createElement('span');
  rootCrumb.className = `breadcrumb-item ${!state.currentPath ? 'active' : ''}`;
  rootCrumb.textContent = 'Root';
  rootCrumb.addEventListener('click', () => {
    if (state.currentPath) loadDirectory('', true);
  });
  elements.breadcrumbList.appendChild(rootCrumb);

  if (!state.currentPath) return;

  const parts = state.currentPath.split('/');
  let accumulated = '';

  parts.forEach((part, index) => {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    const isLast = index === parts.length - 1;

    const sep = document.createElement('span');
    sep.className = 'breadcrumb-separator';
    sep.textContent = '/';
    elements.breadcrumbList.appendChild(sep);

    const crumb = document.createElement('span');
    crumb.className = `breadcrumb-item ${isLast ? 'active' : ''}`;
    crumb.textContent = part;

    if (!isLast) {
      const targetPath = accumulated;
      crumb.addEventListener('click', () => loadDirectory(targetPath, true));
    }

    elements.breadcrumbList.appendChild(crumb);
  });
}

/**
 * Navigate to parent directory.
 */
function navigateUp() {
  if (!state.currentPath) return;
  const parts = state.currentPath.split('/');
  parts.pop();
  loadDirectory(parts.join('/'), true);
}

/**
 * Renders recent repo shortcut chips.
 */
function renderRecentChips() {
  elements.recentChips.innerHTML = '';
  const repos = state.settings.recentRepos || [];
  repos.slice(0, 4).forEach(repoUrl => {
    const chip = document.createElement('span');
    chip.className = 'recent-chip';
    chip.textContent = repoUrl.replace(/^https?:\/\/github\.com\//i, '');
    chip.title = repoUrl;
    chip.addEventListener('click', () => {
      elements.repoUrlInput.value = repoUrl;
      loadRepository(repoUrl);
    });
    elements.recentChips.appendChild(chip);
  });
}

/**
 * Updates rate limit badge in header.
 */
function updateRateLimit(rateLimit) {
  if (!rateLimit) return;
  elements.rateLimitBadge.textContent = `API: ${rateLimit.remaining}/${rateLimit.limit}`;
  if (rateLimit.remaining <= 5) {
    elements.rateLimitBadge.style.color = '#ef4444';
    elements.rateLimitBadge.title = `Low API rate limit remaining! Resets at ${rateLimit.resetDate?.toLocaleTimeString()}`;
  } else {
    elements.rateLimitBadge.style.color = 'var(--text-muted)';
  }
}

/**
 * Formats byte size.
 */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Start
document.addEventListener('DOMContentLoaded', init);
