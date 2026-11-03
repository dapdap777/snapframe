import { mkdir, cp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

for (const file of ['src/app.js', 'src/renderer.js', 'scripts/serve.mjs']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'favicon.svg', 'src']) await cp(file, `dist/${file}`, { recursive: true });
await writeFile('dist/.nojekyll', '');
let commit = 'local';
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
await writeFile('dist/version.json', JSON.stringify({ version: '1.0.0', commit }, null, 2) + '\n');
console.log('Build successful → dist/ (no runtime dependencies)');
