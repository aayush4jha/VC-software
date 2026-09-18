// The verify-* scripts run tsc output directly under node, which needs explicit
// .mjs specifiers. tsc emits `.js` files with extensionless relative imports
// ('./company-dedupe'), so rename the outputs and rewrite those specifiers.
//
// Usage: node scripts/fix-test-imports.mjs <outDir>
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
        .replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) =>
            /\.m?js$/.test(spec) ? m : `${a}${spec}.mjs${b}`);
    fs.writeFileSync(path.join(dir, f.replace(/\.js$/, '.mjs')), src);
    fs.unlinkSync(path.join(dir, f));
}
