import { isTextFile, detectLanguage } from '../modules/fileTypes.js';
import { parseGitHubUrl } from '../modules/githubApi.js';
import { renderCodeWithLineNumbers } from '../modules/highlighter.js';
import { saveSession, loadSession, clearSession } from '../modules/storage.js';
import { buildTreeIndex, getItemsInPath } from '../modules/treeIndex.js';

let passed = 0;
let failed = 0;

function assert(condition, desc) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAILED: ${desc}`);
  }
}

// Test fileTypes whitelist
const textFiles = [
  'README.md', 'main.py', 'test.lua', 'App.java', 'config.yaml', 'service.yml',
  'index.js', 'styles.css', 'index.html', 'schema.sql', 'Dockerfile', 'Makefile',
  '.gitignore', '.env', 'CMakeLists.txt', 'script.sh', 'main.rs', 'server.go'
];

textFiles.forEach(f => {
  assert(isTextFile(f), `Expected ${f} to be recognized as text file`);
});

const nonTextFiles = [
  'image.png', 'photo.jpg', 'archive.zip', 'binary.exe', 'lib.dll', 'font.woff2', 'audio.mp3'
];

nonTextFiles.forEach(f => {
  assert(!isTextFile(f), `Expected ${f} to NOT be recognized as text file`);
});

// Test parseGitHubUrl
const url1 = parseGitHubUrl('https://github.com/ejrad/PasteLibrary.git');
assert(url1.owner === 'ejrad' && url1.repo === 'PasteLibrary', 'Parsed standard git URL');

const url2 = parseGitHubUrl('facebook/react');
assert(url2.owner === 'facebook' && url2.repo === 'react', 'Parsed owner/repo shorthand');

const url3 = parseGitHubUrl('https://github.com/torvalds/linux/tree/master/kernel');
assert(url3.owner === 'torvalds' && url3.repo === 'linux' && url3.ref === 'master' && url3.path === 'kernel', 'Parsed branch and path');

// Test highlighter
const code = 'function hello() {\n  return "world";\n}';
const rendered = renderCodeWithLineNumbers(code, 'javascript');
assert(rendered.lineCount === 3, 'Rendered correct line count');
assert(rendered.html.includes('tok-keyword'), 'Contains keyword token');
assert(rendered.html.includes('tok-string'), 'Contains string token');

// Test session persistence
await saveSession({
  repoInput: 'owner/repo',
  owner: 'owner',
  repo: 'repo',
  ref: 'main',
  currentPath: 'src/components',
  activeFile: { name: 'App.jsx', path: 'src/components/App.jsx' }
});

const restored = await loadSession();
assert(restored !== null, 'Loaded saved session');
assert(restored.currentPath === 'src/components', 'Restored correct current path');
assert(restored.activeFile.name === 'App.jsx', 'Restored active file name');

await clearSession();
const cleared = await loadSession();
assert(cleared === null, 'Cleared session');

// Test treeIndex building and instant path retrieval
const mockTree = [
  { path: 'README.md', type: 'blob', size: 500, sha: '111' },
  { path: 'package.json', type: 'blob', size: 300, sha: '222' },
  { path: 'logo.png', type: 'blob', size: 10000, sha: '333' }, // should be filtered out
  { path: 'src', type: 'tree', sha: '444' },
  { path: 'src/index.js', type: 'blob', size: 120, sha: '555' },
  { path: 'src/utils', type: 'tree', sha: '666' },
  { path: 'src/utils/math.lua', type: 'blob', size: 250, sha: '777' }
];

const index = buildTreeIndex(mockTree, isTextFile);

// Root items
const rootItems = getItemsInPath(index, '');
assert(rootItems.some(i => i.name === 'src' && i.type === 'dir'), 'Root has "src" folder');
assert(rootItems.some(i => i.name === 'README.md' && i.type === 'file'), 'Root has "README.md" file');
assert(rootItems.some(i => i.name === 'package.json' && i.type === 'file'), 'Root has "package.json" file');
assert(!rootItems.some(i => i.name === 'logo.png'), 'Non-text file "logo.png" filtered out');

// Subdirectory items
const srcItems = getItemsInPath(index, 'src');
assert(srcItems.some(i => i.name === 'utils' && i.type === 'dir'), 'src has "utils" folder');
assert(srcItems.some(i => i.name === 'index.js' && i.type === 'file'), 'src has "index.js" file');

// Nested subdirectory items
const utilsItems = getItemsInPath(index, 'src/utils');
assert(utilsItems.length === 1 && utilsItems[0].name === 'math.lua', 'src/utils has math.lua');

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
