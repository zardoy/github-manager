//@ts-check
const { defineConfig } = require('@zardoy/vscode-utils/build/defineConfig.cjs')
const { patchPackageJson } = require('@zardoy/vscode-utils/build/patchPackageJson.cjs')

// patchPackageJson({})

module.exports = defineConfig({
    esbuild: {
        keepNames: true,
    },
    target: {
        desktop: true,
        web: false,
    },
})
