import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skip = new Set(['.git', 'node_modules', 'dist', 'coverage']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function relImport(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).replaceAll(path.sep, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.ts$/, '.js');
}

const httpTypesPath = path.join(root, 'api/lib/http-types.ts');
const httpTypes = `import type { IncomingHttpHeaders } from 'node:http';

/** Platform-neutral HTTP request shape used by the Railway/Express runtime. */
export interface ApiRequest {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders & Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body?: any;
  cookies?: Record<string, string>;
  rawBody?: Buffer;
  [key: string]: any;
}

/** Platform-neutral HTTP response shape used by the Railway/Express runtime. */
export interface ApiResponse {
  statusCode: number;
  status(code: number): ApiResponse;
  json(body: any): ApiResponse;
  send(body: any): ApiResponse;
  end(body?: any): ApiResponse;
  setHeader(name: string, value: string | string[] | number): any;
  getHeader(name: string): number | string | string[] | undefined;
  [key: string]: any;
}
`;
fs.writeFileSync(httpTypesPath, httpTypes);

let converted = 0;
for (const file of walk(root)) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('@vercel/node')) continue;

  const matches = [...src.matchAll(/import\s+type\s+\{([^}]+)\}\s+from\s+['"]@vercel\/node['"];?\s*/g)];
  if (matches.length !== 1) {
    throw new Error(`${path.relative(root, file)}: expected exactly one @vercel/node type import, found ${matches.length}`);
  }
  const imported = matches[0][1].split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = new Set(['VercelRequest', 'VercelResponse']);
  const unexpected = imported.filter((name) => !allowed.has(name));
  if (unexpected.length) throw new Error(`${path.relative(root, file)}: unexpected @vercel/node types: ${unexpected.join(', ')}`);

  const names = [];
  if (imported.includes('VercelRequest')) names.push('ApiRequest');
  if (imported.includes('VercelResponse')) names.push('ApiResponse');
  const importPath = relImport(file, httpTypesPath);
  const replacement = `import type { ${names.join(', ')} } from '${importPath}';\n`;
  src = src.replace(matches[0][0], replacement);
  src = src.replaceAll('VercelRequest', 'ApiRequest').replaceAll('VercelResponse', 'ApiResponse');
  src = src
    .replaceAll('Vercel serverless', 'production Express API')
    .replaceAll('Vercel Serverless', 'production Express API')
    .replaceAll('off Vercel', 'off the public client');
  fs.writeFileSync(file, src);
  converted += 1;
}

const indexPath = path.join(root, 'index.tsx');
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace("import { Analytics } from '@vercel/analytics/react';\n", '');
index = index.replace(/\n\s*<Analytics\s*\/>/, '');
fs.writeFileSync(indexPath, index);

const packagePath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
for (const dep of ['@vercel/analytics', '@vercel/speed-insights']) delete pkg.dependencies?.[dep];
delete pkg.devDependencies?.['@vercel/node'];
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const claudePath = path.join(root, 'CLAUDE.md');
if (fs.existsSync(claudePath)) {
  let text = fs.readFileSync(claudePath, 'utf8');
  text = text.replace(
    /Vercel and Netlify artifacts \(`\.vercelignore`, `netlify\.toml`\) remain in the repo for history and ad hoc previews but are \*\*not\*\* the production authority[^\n]*/,
    'Netlify artifacts remain only as historical configuration. Vercel is not a supported deployment, preview, analytics, or runtime target for this repository. Production is Railway-first with Cloud Run fallback as documented in DEPLOYMENT.md.',
  );
  text = text.replace(
    /Set real secrets there — the Vercel project\(s\) linked to this repo are for ad hoc previews only and are never production \(see `\.vercelignore`\)\./,
    'Set real secrets there. Do not configure or use Vercel for this repository.',
  );
  fs.writeFileSync(claudePath, text);
}

const vercelIgnore = path.join(root, '.vercelignore');
if (fs.existsSync(vercelIgnore)) fs.unlinkSync(vercelIgnore);

console.log(`Converted ${converted} TypeScript files away from @vercel/node.`);
if (converted < 1) throw new Error('No @vercel/node imports were converted; source shape drifted.');
