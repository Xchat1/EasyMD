import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Reuse the project's TypeScript compiler; no test-time bundler is needed.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
      for (const extension of ['.ts', '.tsx']) {
        try { return nextResolve(`${specifier}${extension}`, context); } catch { /* try next */ }
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:')) {
      const path = fileURLToPath(url);
      if (/\.tsx?$/.test(path)) {
        const source = ts.transpileModule(readFileSync(path, 'utf8'), {
          fileName: path,
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        }).outputText;
        return { format: 'module', source, shortCircuit: true };
      }
      if (/\.css$/.test(path)) {
        return { format: 'module', source: `export default ${JSON.stringify(readFileSync(path, 'utf8'))};`, shortCircuit: true };
      }
    }
    return nextLoad(url, context);
  },
});
