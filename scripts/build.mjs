import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'src');
const gameRoot = path.join(sourceRoot, 'game');
const outputPath = path.join(root, 'outputs', 'skyfire-aces.html');
const styleToken = '/*__SKYFIRE_STYLES__*/';
const scriptToken = '/*__SKYFIRE_SCRIPT__*/';

const template = await readFile(path.join(sourceRoot, 'index.template.html'), 'utf8');
const styles = await readFile(path.join(sourceRoot, 'styles.css'), 'utf8');
const sourceFiles = (await readdir(gameRoot))
  .filter(name => /^\d{2}-.+\.js$/.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (!template.includes(styleToken) || !template.includes(scriptToken)) {
  throw new Error('Source template is missing a build token.');
}
if (sourceFiles.length === 0) throw new Error('No ordered game source files found.');

const scripts = await Promise.all(
  sourceFiles.map(name => readFile(path.join(gameRoot, name), 'utf8'))
);
const eol = template.includes('\r\n') ? '\r\n' : '\n';
const output = template.replace(styleToken, styles).replace(scriptToken, scripts.join(eol));

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8');
  const normalize = value => value.replace(/\r\n/g, '\n');
  if (normalize(current) !== normalize(output)) {
    throw new Error('outputs/skyfire-aces.html is not synchronized with src/.');
  }
  console.log(`Build check passed (${sourceFiles.length} source files).`);
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, 'utf8');
  console.log(`Built outputs/skyfire-aces.html from ${sourceFiles.length} source files.`);
}
