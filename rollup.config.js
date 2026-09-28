const peerDepsExternal = require("rollup-plugin-peer-deps-external");
const resolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const typescript = require("@rollup/plugin-typescript");
const postcss = require("rollup-plugin-postcss");
const packageJson = require("./package.json");

module.exports = {
  input: "src/index.ts",
  output: [
    {
      file: packageJson.main,
      format: "cjs",
      sourcemap: true,
      exports: "named",
    },
    {
      file: packageJson.module,
      format: "esm",
      sourcemap: true,
      exports: "named",
    },
  ],
  plugins: [
    peerDepsExternal(),
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "lib",
      exclude: ["**/stories/**", "**/*.stories.*"],
    }),
    postcss({
      extensions: [".css"],
      inject: true,
      extract: false,
    }),
  ],
  external: ["react", "react-dom", "react/jsx-runtime", "fabric", "react-colorful"],
};
