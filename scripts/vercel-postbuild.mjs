import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(src)) {
    const srcPath = join(src, file);
    const destPath = join(dest, file);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// Clean previous output
try { rmSync(join(root, '.vercel/output'), { recursive: true, force: true }); } catch {}

// 1. Create structure
mkdirSync(join(root, '.vercel/output/static'), { recursive: true });
mkdirSync(join(root, '.vercel/output/functions/index.func'), { recursive: true });

// 2. Copy static client assets
copyDir(join(root, 'dist/client'), join(root, '.vercel/output/static'));

// 3. Write Node.js adapter entry point (temp file for bundling)
const adapterSrc = join(root, 'dist/server/_vercel_adapter.cjs');
writeFileSync(adapterSrc, `
const serverModule = require('./server.js');
const server = serverModule.default ?? serverModule;

module.exports = async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['host'] || 'localhost';
  const url = new URL(req.url, proto + '://' + host);

  const headersInit = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headersInit[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }

  let body = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) body = Buffer.concat(chunks);
  }

  const request = new Request(url.toString(), {
    method: req.method,
    headers: headersInit,
    body: body ?? null,
    duplex: 'half',
  });

  const response = await server.fetch(request, {}, {});

  res.statusCode = response.status;
  response.headers.forEach((val, key) => res.setHeader(key, val));

  const buf = Buffer.from(await response.arrayBuffer());
  res.end(buf);
};
`);

// 4. Bundle adapter + server into single CJS Node.js function
await build({
  entryPoints: [adapterSrc],
  bundle: true,
  format: 'cjs',
  outfile: join(root, '.vercel/output/functions/index.func/index.js'),
  platform: 'node',
  target: 'node22',
  minify: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});

// Cleanup temp file
try { rmSync(adapterSrc); } catch {}

// 5. Node.js function config
writeFileSync(join(root, '.vercel/output/functions/index.func/.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.js',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
}));


// 6. Vercel output config
writeFileSync(join(root, '.vercel/output/config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/assets/.+', headers: { 'cache-control': 's-maxage=31536000, immutable' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index' },
  ],
}));

console.log('Vercel output ready at .vercel/output/');
