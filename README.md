# buggy-transformation

A regression test harness comparing how 9 JavaScript/TypeScript tools handle `new` expressions combined with tagged template literals and optional chaining — two edge cases where incorrect parentheses stripping changes program semantics.

## The Problem

```js
const foo = () => (args) => class A {};
export const TestA = new (foo()`bar`)();

const baz = () => ({ qux: class A {} });
export const TestB = new (baz()?.qux)();
```

The outer parentheses around `` foo()`bar` ``and `baz()?.qux` are semantically required. Without them, `new` binds differently:

| Input                | Correct              | Buggy (wrong semantics)                    |
| -------------------- | -------------------- | ------------------------------------------ |
| `new (foo()`bar`)()` | `new (foo()`bar`)()` | `new foo()`bar`()`                         |
| `new (baz()?.qux)()` | `new (baz()?.qux)()` | `new (baz())?.qux()` or `new baz()?.qux()` |

## Tested Tools

| Tool             | Version | Result      |
| ---------------- | ------- | ----------- |
| prettier         | ^3.5.0  | ✅PASS      |
| esbuild          | ^0.25.0 | ❌FAIL [^1] |
| typescript (tsc) | ^5.8.0  | ✅PASS      |
| babel            | ^7.27.0 | ❌FAIL [^1] |
| webpack          | ^5.98.0 | ✅PASS      |
| swc              | ^1.11.0 | ❌FAIL [^2] |
| oxc-transform    | ^0.53.0 | ❌FAIL [^2] |
| bun              | ^1.3.14 | ❌FAIL [^1] |
| terser           | ^5.48.0 | ❌FAIL [^2] |

- [^1]: Strips required parentheses in both tagged-template and optional-chaining cases.
- [^2]: Strips required parentheses in the tagged-template case only.

## Usage

```bash
npm install
npm test
```

Each tool processes `src/input.js` or `src/input.ts`, writes output to `dist/<tool>/output.js`, and results are checked for correctness.
