import { runTests } from '@vscode/test-electron'
import { join } from 'path'
;(async () => {
    await runTests({
        extensionDevelopmentPath: join(__dirname, '../out'),
        extensionTestsPath: join(__dirname, './suite'),
        version: 'insiders',
    })
})().catch(err => {
    console.error(err)
    process.exit(1)
})
