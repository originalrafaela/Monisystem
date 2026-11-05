import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const pkg = readJson('package.json');
const { expo } = readJson('app.json');
assert.equal(pkg.name, 'monisystem');
assert.equal(pkg.private, true);
assert.equal(pkg.main, 'expo-router/entry');
assert.equal(expo.name, 'Monisystem');
assert.ok(expo.plugins.includes('expo-router'));
assert.equal(readJson('tsconfig.json').compilerOptions.strict, true);
for (const path of [
  'src/app/_layout.tsx', 'src/app/index.tsx', 'src/components', 'src/config/app.ts',
  'src/domain/entities.ts', 'src/types/result.ts', 'src/services/contracts.ts',
]) assert.ok(existsSync(path), `Missing: ${path}`);
const ignore = readFileSync('.gitignore', 'utf8').split('\n');
for (const entry of ['node_modules/', '.env', '.maestri/', '.codex/', '.agents/', 'AGENTS.md', '.aws/']) {
  assert.ok(ignore.includes(entry), `Missing ignore: ${entry}`);
}
console.log('Estrutura e configuração JSON verificadas. Não substitui TypeScript, ESLint ou execução Android.');
