import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const file = require.resolve('@circle-fin/cli');
const original = 'async function isKeychainAvailable() {';
const marker = '/* margit: per-session file storage; never use host keychain */';
let source = readFileSync(file, 'utf8');
if (!source.includes(marker)) {
  if (!source.includes(original)) throw new Error('Circle CLI storage adapter needs review before upgrading.');
  source = source.replace(original, `${original}\n  ${marker}\n  return false;`);
  writeFileSync(file, source);
}

for (const [signature, result] of [
  ['async function keychainLoad(account) {', 'null'],
  ['async function keychainStore(account, secret) {', 'false'],
  ['async function keychainDelete(account) {', 'undefined'],
]) {
  const patched = `${signature}\n  /* margit: no host keychain access */ return ${result};`;
  if (!source.includes(patched)) {
    if (!source.includes(signature)) throw new Error('Circle CLI keychain interface changed.');
    source = source.replace(signature, patched);
  }
}
writeFileSync(file, source);
