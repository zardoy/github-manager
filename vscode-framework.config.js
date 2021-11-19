//@ts-check

/** @type{import('vscode-framework/build/config').UserConfig} */
const config = {
    esbuild: {
        keepNames: true,
    },
    target: {
        desktop: true,
        web: false,
    },
}

module.exports = config
