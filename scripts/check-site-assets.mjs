import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url);
const expected = new Set(JSON.parse(readFileSync(new URL('config/site-assets.json', root), 'utf8')));
const publicDir = new URL('public/', root).pathname;

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
    throw new Error(`Site asset manifest mismatch. Missing: ${missing.join(', ') || 'none'}. Unlisted: ${extra.join(', ') || 'none'}. Update config/site-assets.json and .gitignore together when adding runtime assets.`);
}

const gitignoreUrl = new URL('.gitignore', root);
if (existsSync(gitignoreUrl)) {
    const gitignore = readFileSync(gitignoreUrl, 'utf8');
    const missingIgnore = [...expected].filter(path => !gitignore.includes(`!/public/${path}`));
    if (missingIgnore.length) {
        throw new Error(`Site assets are listed in config/site-assets.json but not un-ignored in .gitignore: ${missingIgnore.join(', ')}.`);
    }
}

if (existsSync(new URL('.git', root))) {
    const untracked = [...expected].filter(path => {
        const result = spawnSync('git', ['ls-files', '--error-unmatch', `public/${path}`], {
            cwd: new URL('.', root).pathname,
            encoding: 'utf8',
        });
        return result.status !== 0;
    });
    if (untracked.length) {
        throw new Error(`Site assets exist locally but are not tracked in Git: ${untracked.join(', ')}. Add them so Vercel receives the same files.`);
    }
}

console.log(`Checked ${expected.size} runtime site assets.`);
