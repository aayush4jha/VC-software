// The verify-* scripts run tsc output directly under node, which needs explicit
// .mjs specifiers. tsc emits `.js` files with extensionless relative imports
// ('./company-dedupe'), so rename the outputs and rewrite those specifiers.
//
// Walks subdirectories too: a suite that compiles both src/lib/x.ts and
// src/lib/server/y.ts gets a server/ folder in the output, and leaving its
// files as .js broke the import from the one above it.
//
// Usage: node scripts/fix-test-imports.mjs <outDir>
import fs from 'fs';
import path from 'path';

function fix(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { fix(full); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const src = fs.readFileSync(full, 'utf8')
            .replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) =>
                /\.m?js$/.test(spec) ? m : `${a}${spec}.mjs${b}`);
        fs.writeFileSync(full.replace(/\.js$/, '.mjs'), src);
        fs.unlinkSync(full);
    }
}

fix(process.argv[2]);
