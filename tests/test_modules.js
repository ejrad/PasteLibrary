import { isTextFile, detectLanguage } from '../modules/fileTypes.js';
import { parseGitHubUrl } from '../modules/githubApi.js';
import { renderCodeWithLineNumbers } from '../modules/highlighter.js';
import { saveSession, loadSession, clearSession } from '../modules/storage.js';

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

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
