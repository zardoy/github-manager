import path from 'path'
import vscode from 'vscode'
import { getExtensionSetting, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { getDirectoriesToShow } from './getDirs'
import { getReposDir, GithubRepo } from './git'

const askOpenInNewWindow = async () =>
    showQuickPick([
        { label: '$(activate-breakpoints) Open in new window', value: true },
        { label: '$(circle-outline) Open in current window', value: false },
    ])

interface Options {
    /** @returns with returnValue = relative path from default dir */
    getDirectories: () => ReturnType<typeof getDirectoriesToShow>
    quickPickOptions: Pick<vscode.QuickPickOptions, 'title'>
}

export const openNewDirectory = async ({ getDirectories, quickPickOptions }: Options) => {
    const whereToOpen = getExtensionSetting('whereToOpen')
    let forceOpenNewWindow: undefined | boolean

    if (whereToOpen === 'ask(before)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    // TODO vscode-extra: refactor with first arg promise
    const quickPick = vscode.window.createQuickPick<VSCodeQuickPickItem>()
    quickPick.busy = true
    quickPick.title = quickPickOptions.title
    console.time('Get Directories')
    const { directories } = await getDirectories()
    console.timeEnd('Get Directories')

    quickPick.items = directories.map(({ dirName, displayName, description }) => ({ label: displayName, value: dirName, description }))
    quickPick.busy = false

    // copied from vscode-extra
    const selectedDirName = await new Promise<string | undefined>(resolve => {
        quickPick.onDidHide(() => {
            resolve(undefined)
            quickPick.dispose()
        })
        quickPick.onDidAccept(() => {
            // align with default showQuickPick behavior
            if (quickPick.items.length === 0) return
            const { selectedItems } = quickPick
            resolve(selectedItems[0]?.value)
            quickPick.hide()
        })
        quickPick.show()
    })
    if (!selectedDirName) return

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    await openSelectedDirectory(selectedDirName, forceOpenNewWindow)
}

export const openSelectedDirectory = async (dirPath: GithubRepo['dirPath'], forceOpenNewWindow?: boolean) => {
    const gitDefaultDir = getReposDir()
    const whereToOpen = getExtensionSetting('whereToOpen')
    const folderUri = vscode.Uri.file(path.join(gitDefaultDir, dirPath))
    const forceNewWindow = (() => {
        if (forceOpenNewWindow !== undefined) return forceOpenNewWindow
        if (whereToOpen === 'alwaysSameWindow') return false
        if (whereToOpen === 'newWindowIfNotEmpty') return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        return false
    })()
    await vscode.commands.executeCommand('vscode.openFolder', folderUri, {
        forceNewWindow,
    })
}
