/**
 * Extracts fenced code blocks from Markdown or plain text files.
 */

import { detectLanguage } from './fileTypes.js';

const LANG_ALIASES = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  shellscript: 'shell',
  cs: 'csharp',
  'c#': 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  rb: 'ruby',
  rs: 'rust',
  md: 'markdown',
  luau: 'lua',
  docker: 'dockerfile'
};

/**
 * Normalizes a fenced code block language tag for syntax highlighting.
 * @param {string} rawLang 
 * @returns {string}
 */
export function normalizeBlockLang(rawLang) {
  if (!rawLang) return 'text';
  const tag = rawLang.trim().split(/\s+/)[0].toLowerCase();
  if (!tag) return 'text';
  if (LANG_ALIASES[tag]) return LANG_ALIASES[tag];
  return detectLanguage(`file.${tag}`) !== 'text' ? detectLanguage(`file.${tag}`) : tag;
}

/**
 * Checks if the line directly above a code block is an isolated, definitive title.
 * Returns the cleaned title string, or null if not definitively a title.
 * @param {string[]} lines 
 * @param {number} openIndex 
 * @returns {string|null}
 */
function extractPrecedingTitle(lines, openIndex) {
  if (openIndex <= 0) return null;

  const rawPrev = lines[openIndex - 1].trim();
  if (!rawPrev) return null;

  // Must be isolated (start of file or preceded by a blank line)
  if (openIndex >= 2 && lines[openIndex - 2].trim() !== '') {
    return null;
  }

  // Reject markdown structural lines (fences, lists, blockquotes, rules, HTML, tables)
  if (/^(`{3,}|~{3,}|[-*+]\s|\d+\.\s|>|<|\||[-*_]{3,}\s*$)/.test(rawPrev)) {
    return null;
  }

  let candidate = rawPrev;

  // Strip Markdown heading prefix (e.g. "### Elevated PowerShell:")
  const isHeading = /^#{1,6}\s+/.test(candidate);
  if (isHeading) {
    candidate = candidate.replace(/^#{1,6}\s+/, '').trim();
  }

  // Strip surrounding bold/italic markers (e.g. "**Elevated PowerShell:**" or "**Elevated PowerShell**:")
  candidate = candidate.replace(/^(\*\*|__|\*|_)(.+?)\1(:?)$/, '$2$3').trim();

  const hasTrailingColon = candidate.endsWith(':');
  if (hasTrailingColon) {
    candidate = candidate.slice(0, -1).trim();
  }

  if (!candidate || candidate.length > 60) return null;

  // Reject prose sentences, links, or punctuation that indicates non-title text
  if (/[.?!,;]$/.test(candidate)) return null;
  if (/[.?!]\s/.test(candidate)) return null;
  if (/\]\(/.test(candidate)) return null;

  // Require at least one letter/digit
  if (!/[a-zA-Z0-9]/.test(candidate)) return null;

  // Must be a heading, end with ':', or be a short isolated label without sentence structure
  if (isHeading || hasTrailingColon || candidate.split(/\s+/).length <= 6) {
    return candidate;
  }

  return null;
}

/**
 * Builds a concise display name for a code block.
 * @param {number} oneBasedIndex 
 * @param {string} content 
 * @param {string|null} title 
 * @returns {string}
 */
function buildBlockLabel(oneBasedIndex, content, title = null) {
  if (title) return title;

  const firstLine = content
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0);

  if (!firstLine) return `Block ${oneBasedIndex}`;
  const preview = firstLine.length > 26 ? `${firstLine.slice(0, 26)}…` : firstLine;
  return `#${oneBasedIndex} · ${preview}`;
}

/**
 * Iterates through file text and extracts all fenced code blocks (``` or ~~~).
 * @param {string} text 
 * @returns {Array<{ index: number, name: string, path: string, type: 'codeblock', lang: string, rawLang: string, content: string, lineCount: number, size: number }>}
 */
export function extractCodeBlocks(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let rawLang = '';
  let currentTitle = null;
  let buffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFence) {
      const openMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})(.*)$/);
      if (openMatch) {
        const marker = openMatch[1];
        const info = openMatch[2] || '';
        // Backtick info strings cannot contain backticks per CommonMark
        if (marker[0] === '`' && info.includes('`')) {
          continue;
        }
        inFence = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
        rawLang = info.trim().split(/\s+/)[0] || '';
        currentTitle = extractPrecedingTitle(lines, i);
        buffer = [];
      }
    } else {
      const closeMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
        const content = buffer.join('\n');
        const idx = blocks.length;
        blocks.push({
          index: idx,
          name: buildBlockLabel(idx + 1, content, currentTitle),
          path: `#block-${idx + 1}`,
          type: 'codeblock',
          lang: normalizeBlockLang(rawLang),
          rawLang: rawLang.toLowerCase(),
          content,
          lineCount: buffer.length,
          size: content.length
        });
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
        rawLang = '';
        currentTitle = null;
        buffer = [];
      } else {
        buffer.push(line);
      }
    }
  }

  return blocks;
}
