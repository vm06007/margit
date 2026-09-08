import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const expected = new Set(JSON.parse(readFileSync(new URL('../config/site-assets.json', import.meta.url), 'utf8')));
const publicDir = new URL('../public/', import.meta.url).pathname;

function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? files(path) : [relative(publicDir, path)];
    });
}

const actual = new Set(files(join(publicDir, 'site')));
const missing = [...expected].filter(path => !actual.has(path));
const extra = [...actual].filter(path => !expected.has(path));
if (missing.length || extra.length) {
    throw new Error(`Site asset manifest mismatch. Missing: ${missing.join(', ') || 'none'}. Unlisted: ${extra.join(', ') || 'none'}.`);
}
console.log(`Checked ${expected.size} runtime site assets.`);
