const peerDepsExternal = require("rollup-plugin-peer-deps-external");
const resolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const postcss = require("rollup-plugin-postcss");
const esbuild = require("esbuild");
const packageJson = require("./package.json");

/** Strip TypeScript with esbuild so Rollup never parses `export type` / TSX raw. */
function esbuildTs() {
  return {
    name: "esbuild-ts",
    async transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes("node_modules")) return null;
      const loader = id.endsWith("tsx") ? "tsx" : id.endsWith("ts") ? "ts" : "js";
      const result = await esbuild.transform(code, {
        loader,
        jsx: "automatic",
        sourcemap: true,
        sourcefile: id,
        tsconfigRaw: {
          compilerOptions: {
            jsx: "react-jsx",
            useDefineForClassFields: false,
          },
        },
      });
      return { code: result.code, map: result.map };
    },
  };
}

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
    resolve({ extensions: [".mjs", ".js", ".json", ".node", ".ts", ".tsx"] }),
    commonjs(),
    esbuildTs(),
    postcss({
      extensions: [".css"],
      inject: true,
      extract: false,
    }),
  ],
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "fabric",
    "react-colorful",
    "roughjs",
  ],
};
