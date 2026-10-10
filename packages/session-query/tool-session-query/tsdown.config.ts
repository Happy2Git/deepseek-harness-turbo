import { defineConfig } from 'tsdown'

/** Bundle each Loader entry independently so published files need no private chunks. */
export default defineConfig(['index', 'turbo-context'].map(entry => ({
  entry: [`lib/types/${entry}.js`],
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
})))
