import fs from "node:fs/promises";
import dts from "rollup-plugin-dts";
//import esbuild from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from '@rollup/plugin-commonjs';

const target_browsers = ['chrome137', 'firefox136', 'safari18', 'edge127'];
const target_server = ['node18'];

const rawPackageJSON = await fs.readFile("package.json", { encoding: "utf8" });

/** @type {import('./package.json')} */
const { name, version, main } = JSON.parse(rawPackageJSON);

const libOutputPath = main.replace(/\.[cm]?js$/, "");
const camelCaseName = name.replace(/-./g, (x) => x[1].toUpperCase());

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

	// Output for browser
	bundle({
		//plugins: [esbuild({ target: target_browsers, minify: true })],
		plugins: [typescript(), commonjs(), nodeResolve()],
		output: {
			file: `./out/${name}-v${version}.js`,
			format: "esm",
			name: camelCaseName,
			sourcemap: true,
			compact: true,
		},
	}),
];
