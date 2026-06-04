import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname);

mkdirSync(resolve(ROOT, 'dist'), { recursive: true });

const results = [];

/**
 * Detect whether parentheses around `new` callee were stripped.
 *
 * Case 1 (tagged template):
 *   Correct: new (foo()`bar`)()    — `(` right after `new`
 *   Buggy:   new foo()`bar`()     — identifier right after `new`
 *
 * Case 2 (optional chaining):
 *   Correct: new (baz()?.qux)()   — `(` right after `new`, `?.` inside outer parens
 *   Buggy A: new baz()?.qux()     — identifier right after `new`
 *   Buggy B: new (baz())?.qux     — parens close before `?.`
 */
function checkParens(code) {
  const buggy = [];

  // Case 1: buggy if `new` is followed by `foo(` (not `(` first)
  if (/new\s+foo\s*\(/.test(code)) {
    buggy.push('tagged-template');
  }

  // Case 2: buggy if `new` is followed by `baz(` (no outer paren),
  //         or if parens only wrap baz() not the chain: `new (baz())?.`
  if (/new\s+baz\s*\(/.test(code) || /new\s*\(\s*baz\s*\(\s*\)\s*\)\s*\?\./.test(code)) {
    buggy.push('optional-chaining');
  }

  if (buggy.length === 0) {
    return { status: 'OK' };
  }
  return { status: 'BUGGY', stripped: buggy };
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts });
  } catch (e) {
    return { error: e.stderr || e.message };
  }
}

function readOutput(path) {
  try {
    return readFileSync(resolve(ROOT, path), 'utf8');
  } catch {
    return null;
  }
}

// ─── 1. prettier ───
{
  const label = 'prettier';
  try {
    const input = readFileSync(resolve(ROOT, 'src/input.js'), 'utf8');
    const out = execSync('npx prettier --stdin-filepath input.js', {
      cwd: ROOT, encoding: 'utf8', input, stdio: 'pipe',
    });
    const r = checkParens(out);
    results.push({ tool: label, ...r, output_snippet: out.trim() });
  } catch (e) {
    results.push({ tool: label, error: e.stderr || e.message });
  }
}

// ─── 2. esbuild ───
{
  const label = 'esbuild';
  const outFile = 'dist/esbuild/output.js';
  mkdirSync(resolve(ROOT, 'dist/esbuild'), { recursive: true });
  const cmd = `npx esbuild src/input.ts --outfile=${outFile} --target=es2022 --format=esm`;
  const r = run(cmd);
  if (r.error) {
    results.push({ tool: label, error: r.error });
  } else {
    const code = readOutput(outFile);
    if (code) {
      const chk = checkParens(code);
      results.push({ tool: label, ...chk, output_snippet: code.trim() });
    } else {
      results.push({ tool: label, error: 'no output file' });
    }
  }
}

// ─── 3. tsc ───
{
  const label = 'typescript (tsc)';
  const r = run('npx tsc --outDir dist/tsc');
  if (r.error) {
    results.push({ tool: label, error: r.error });
  } else {
    const code = readOutput('dist/tsc/input.js');
    if (code) {
      const chk = checkParens(code);
      results.push({ tool: label, ...chk, output_snippet: code.trim() });
    } else {
      results.push({ tool: label, error: 'no output file' });
    }
  }
}

// ─── 4. babel ───
{
  const label = 'babel';
  const outFile = 'dist/babel/output.js';
  mkdirSync(resolve(ROOT, 'dist/babel'), { recursive: true });
  const r = run(`npx babel src/input.js --out-file ${outFile}`);
  if (r.error) {
    results.push({ tool: label, error: r.error });
  } else {
    const code = readOutput(outFile);
    if (code) {
      const chk = checkParens(code);
      results.push({ tool: label, ...chk, output_snippet: code.trim() });
    } else {
      results.push({ tool: label, error: 'no output file' });
    }
  }
}

// ─── 5. webpack ───
{
  const label = 'webpack';
  const r = run('npx webpack --config webpack.config.cjs');
  if (r.error) {
    results.push({ tool: label, error: r.error });
  } else {
    const code = readOutput('dist/webpack/output.js');
    if (code) {
      const chk = checkParens(code);
      results.push({ tool: label, ...chk, output_snippet: code.split('\n').slice(0, 25).join('\n') + '\n...' });
    } else {
      results.push({ tool: label, error: 'no output file' });
    }
  }
}

// ─── 6. swc ───
{
  const label = 'swc';
  const outFile = 'dist/swc/output.js';
  mkdirSync(resolve(ROOT, 'dist/swc'), { recursive: true });
  const r = run(`npx swc src/input.ts -o ${outFile} --config-file .swcrc`);
  if (r.error) {
    results.push({ tool: label, error: r.error });
  } else {
    const code = readOutput(outFile);
    if (code) {
      const chk = checkParens(code);
      results.push({ tool: label, ...chk, output_snippet: code.trim() });
    } else {
      results.push({ tool: label, error: 'no output file' });
    }
  }
}

// ─── 7. oxc (library API, no CLI) ───
{
  const label = 'oxc';
  const outFile = 'dist/oxc/output.js';
  mkdirSync(resolve(ROOT, 'dist/oxc'), { recursive: true });
  try {
    const { transform: oxcTransform } = await import('oxc-transform');
    const code = readFileSync(resolve(ROOT, 'src/input.ts'), 'utf8');
    const result = await oxcTransform(resolve(ROOT, 'src/input.ts'), code, {
      target: 'es2022',
    });
    const chk = checkParens(result.code);
    results.push({ tool: label, ...chk, output_snippet: result.code.trim() });
    // Also write to file for inspection
    const { writeFileSync } = await import('node:fs');
    writeFileSync(resolve(ROOT, outFile), result.code);
  } catch (e) {
    results.push({ tool: label, error: e.message });
  }
}

// ─── 8. bun ───
{
  const label = 'bun';
  mkdirSync(resolve(ROOT, 'dist/bun'), { recursive: true });
  const r = run('npx bun build --target=bun src/input.ts --outfile=dist/bun/output.js 2>&1');
  if (r.error) {
    results.push({ tool: label, error: r.error });
  } else {
    const code = readOutput('dist/bun/output.js');
    if (code) {
      const chk = checkParens(code);
      results.push({ tool: label, ...chk, output_snippet: code.trim() });
    } else {
      results.push({ tool: label, error: 'no output file' });
    }
  }
}

// ─── 9. terser (parse-print round-trip, no compress/mangle) ───
{
  const label = 'terser';
  const outFile = 'dist/terser/output.js';
  mkdirSync(resolve(ROOT, 'dist/terser'), { recursive: true });
  try {
    const { minify } = await import('terser');
    const code = readFileSync(resolve(ROOT, 'src/input.js'), 'utf8');
    const result = await minify(code, {
      compress: false,
      mangle: false,
      module: true,
    });
    if (result.code) {
      const chk = checkParens(result.code);
      results.push({ tool: label, ...chk, output_snippet: result.code.trim() });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(resolve(ROOT, outFile), result.code);
    } else {
      results.push({ tool: label, error: result.error?.message || 'no output' });
    }
  } catch (e) {
    results.push({ tool: label, error: e.message });
  }
}

// ─── Print results ───
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  Buggy Transformation Test: new (...) parentheses stripping');
console.log('══════════════════════════════════════════════════════════════\n');

const icons = { OK: '✓ OK', BUGGY: '✗ BUGGY', UNKNOWN: '? N/A' };

for (const r of results) {
  const icon = icons[r.status] || '??';
  console.log(`${icon}  ${r.tool}`);
  if (r.stripped) {
    console.log(`       stripped: ${r.stripped.join(', ')}`);
  }
  if (r.error) {
    const err = r.error.slice(0, 300).replace(/\n/g, '\\n');
    console.log(`       ERROR: ${err}`);
  }
  if (r.output_snippet) {
    const lines = r.output_snippet.split('\n');
    const relevant = lines.filter(l => /new\s/.test(l));
    if (relevant.length > 0) {
      console.log(`       output: ${relevant.join(' | ')}`);
    }
  }
  console.log();
}

const ok = results.filter(r => r.status === 'OK').length;
const buggy = results.filter(r => r.status === 'BUGGY').length;
const errored = results.filter(r => r.error).length;
console.log('──────────────────────────────────────────────────────────────');
console.log(`Summary: ${ok} OK, ${buggy} BUGGY, ${errored} errors`);
console.log('══════════════════════════════════════════════════════════════\n');
