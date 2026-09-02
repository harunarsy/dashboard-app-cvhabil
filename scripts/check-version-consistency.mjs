import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const changelog = read('CHANGELOG.md');
const latestMatch = changelog.match(/^## \[(v\d+\.\d+\.\d+-stable)\]/m);
if (!latestMatch) {
  console.error('Version consistency failed: latest stable version is missing from CHANGELOG.md');
  process.exit(1);
}

const expected = latestMatch[1];
const failures = [];
const assertIncludes = (relativePath, fragment) => {
  if (!read(relativePath).includes(fragment)) {
    failures.push(`${relativePath} does not contain ${expected}`);
  }
};

assertIncludes('frontend/src/components/Login.jsx', `HABIL SUPERAPP ${expected}`);
assertIncludes('frontend/src/components/Sidebar.jsx', `const appVersion = "${expected}"`);
assertIncludes('frontend/src/index.js', expected);
assertIncludes('SUPERAPP_BRAIN.md', `Current Version: ${expected}`);
assertIncludes('README.md', expected);

const dashboard = read('frontend/src/components/Dashboard.jsx');
const firstRelease = dashboard.match(
  /const RELEASES = \[\s*\{\s*version:\s*["']([^"']+)["']/s,
);
if (!firstRelease || firstRelease[1] !== expected) {
  failures.push(`frontend/src/components/Dashboard.jsx RELEASES[0] is not ${expected}`);
}

if (failures.length) {
  console.error(`Version consistency failed. Expected ${expected}:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Version consistency OK: ${expected}`);
