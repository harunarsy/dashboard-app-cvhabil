import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryDir = path.resolve(sourceDir, '..', '..');

const collectSourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    if (!/\.(?:css|js|jsx)$/.test(entry.name) || entry.name.endsWith('.test.js')) return [];
    return [target];
  });

const readFrontendSource = () => collectSourceFiles(sourceDir)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

describe('semantic design token contract', () => {
  it('defines independent action, selection, focus, and information roles', () => {
    const css = fs.readFileSync(path.join(sourceDir, 'index.css'), 'utf8');
    for (const token of [
      '--color-action:',
      '--color-action-hover:',
      '--color-action-pressed:',
      '--color-selection:',
      '--color-focus:',
      '--color-info:',
      '--assistant-accent-text:',
    ]) expect(css).toContain(token);
  });

  it('contains no retired hue-coupled token or utility', () => {
    const source = readFrontendSource();
    const retiredPrimary = ['--color', 'primary'].join('-');
    const retiredAssistant = ['--assistant', 'primary', 'text'].join('-');
    const hueUtility = new RegExp(
      `(?:bg|text|border|ring|from|via|to)-${['in', 'digo'].join('')}-\\d+`,
      'i',
    );
    expect(source).not.toContain(retiredPrimary);
    expect(source).not.toContain(retiredAssistant);
    expect(source).not.toMatch(hueUtility);
  });

  it('keeps design and product guidance vendor- and hue-neutral', () => {
    const guidance = ['DESIGN.md', 'PRODUCT.md']
      .map((file) => fs.readFileSync(path.join(repositoryDir, file), 'utf8'))
      .join('\n');
    const vendorDoctrine = new RegExp(`${['apple', 'hig'].join('[- ]?')}`, 'i');
    const namedHueDoctrine = new RegExp(
      `${['operational', 'indigo'].join(' ')}|${['indigo', 'wash'].join(' ')}`,
      'i',
    );
    expect(guidance).not.toMatch(vendorDoctrine);
    expect(guidance).not.toMatch(namedHueDoctrine);
  });
});
