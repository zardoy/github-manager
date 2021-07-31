//@ts-check
import { build } from "esbuild"

/** @type {"dev" | "prod"} */
const mode = process.argv[2] || "dev";

const NODE_ENV = mode === "dev" ? "development" : "production";

const result = await build({
    bundle: true,
    watch: NODE_ENV === "development",
    minify: NODE_ENV === "production",
    define: {
        "process.env.NODE_ENV": `"${NODE_ENV}"`
    },
    entryPoints: [
        "src/index.ts"
    ],
    external: [
        "vscode"
    ],
    platform: "node",
    outfile: "out.js",
})

