import fs from "node:fs/promises";
import dts from "rollup-plugin-dts";
//import esbuild from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import typescript from "@rollup/plugin-typescript";
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { wasm } from '@rollup/plugin-wasm';

const target_browsers = ['chrome137', 'firefox136', 'safari18', 'edge127'];
const target_server = ['node18'];

const rawPackageJSON = await fs.readFile("package.json", { encoding: "utf8" });

/** @type {import('./package.json')} */
const { name, version, main } = JSON.parse(rawPackageJSON);

const libOutputPath = main.replace(/\.[cm]?js$/, "");
const camelCaseName = name.replace(/^@[^/]+\//, '').replace(/-./g, (x) => x[1].toUpperCase());

/**
 * @param {string} id
 * @returns {boolean}
 */
const isExternal =
	process.platform === "win32"
		? (/** @type {string} */ id) => !/^(([a-zA-Z]{1}:\\)|[.\\])/.test(id)
		: (/** @type {string} */ id) => !/^[./]/.test(id);

/**
 * @param {import('rollup').RollupOptions} config
 * @returns {import('rollup').RollupOptions}
 */
const bundle = (config) => ({
	...config,
	input: "./src/index.ts",
	external: isExternal,
});

/**
 * @param {import('rollup').RollupOptions} config
 * @returns {import('rollup').RollupOptions}
 */
const browserBundle = (config) => ({
	...config,
	input: "./src/index.ts",
	// Exclude WASM modules that don't work well in browser bundles
	external: (id) => {
		return false;
	},
});

export default [
	// Output for NodeJS
	bundle({
		//plugins: [esbuild({ target: target_server })],
		plugins: [typescript()],
		output: [
			{
				file: `${libOutputPath}.cjs`,
				format: "cjs",
				sourcemap: false,
				compact: false,
			},
			{
				file: `${libOutputPath}.mjs`,
				format: "esm",
				sourcemap: false,
				compact: false,
			},
		],
	}),

	// Output for Typescript's .d.ts
	bundle({
		plugins: [dts()],
		output: {
			file: `${libOutputPath}.d.ts`,
			format: "es",
		},
	}),

	// Output for browser (ESM) - bundled for direct browser use
	browserBundle({
		plugins: [
			replace({
				preventAssignment: true,
				values: {
					__dirname: '"/"',
				},
			}),
			typescript(),
			commonjs(),
			nodeResolve({
				browser: true,
				preferBuiltins: false
			}),
			json(),
			nodePolyfills(),
			wasm({ maxFileSize: 2_000_000, targetEnv: "browser" }),
		],
		output: {
			file: `${libOutputPath}.browser.mjs`,
			format: "esm",
			sourcemap: false,
			compact: true,
			inlineDynamicImports: true,
		},
	}),

	// Output for browser (UMD) - better compatibility with older bundlers
	browserBundle({
		plugins: [
			replace({
				preventAssignment: true,
				values: {
					__dirname: '"/"',
				},
			}),
			typescript(),
			commonjs(),
			nodeResolve({
				browser: true,
				preferBuiltins: false
			}),
			json(),
			nodePolyfills(),
			wasm({ maxFileSize: 2_000_000, targetEnv: "browser" }),
		],
		output: {
			file: `${libOutputPath}.browser.umd.js`,
			format: "umd",
			name: camelCaseName,
			sourcemap: false,
			compact: true,
			inlineDynamicImports: true,
		},
	}),

	// Output for browser (IIFE) - immediate execution, global variable
	browserBundle({
		plugins: [
			replace({
				preventAssignment: true,
				values: {
					__dirname: '"/"',
				},
			}),
			typescript(),
			commonjs(),
			nodeResolve({
				browser: true,
				preferBuiltins: false
			}),
			json(),
			nodePolyfills(),
			wasm({ maxFileSize: 2_000_000, targetEnv: "browser" }),
		],
		output: {
			file: `${libOutputPath}.browser.iife.js`,
			format: "iife",
			name: camelCaseName,
			sourcemap: false,
			compact: true,
			inlineDynamicImports: true,
		},
	}),
];