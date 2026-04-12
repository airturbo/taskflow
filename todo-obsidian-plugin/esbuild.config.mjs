import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import process from 'node:process';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  logLevel: 'info',
  external: ['obsidian', 'electron', ...builtinModules],
  outfile: 'main.js',
});

if (prod) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
