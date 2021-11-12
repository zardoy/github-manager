import { join } from 'path'
import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { getDirectoriesToShow } from './getDirs'

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

const HISTORY_ITEMS_LIMIT = 30

export const openNewDirectory = async ({ getDirectories, quickPickOptions }: Options) => {
    const whereToOpen = getExtensionSetting('whereToOpen')
    let forceOpenNewWindow: undefined | boolean

    if (whereToOpen === 'ask(before)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    type ItemType = {
        dirName: string
        repoSlug?: string
    }

    // TODO vscode-extra: refactor with first arg promise
    const quickPick = vscode.window.createQuickPick<VSCodeQuickPickItem<ItemType>>()
    quickPick.busy = true
    quickPick.title = quickPickOptions.title
    console.time('Get Directories')
    const { directories, cwd, history } = await getDirectories()
    console.timeEnd('Get Directories')

    quickPick.items = directories.map(({ dirName, displayName, description, repoSlug }) => ({ label: displayName, value: { dirName, repoSlug }, description }))
    quickPick.busy = false

    // copied from vscode-extra
    const selectedDirName = await new Promise<ItemType | undefined>(resolve => {
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
    const { dirName, repoSlug } = selectedDirName

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    await extensionCtx.globalState.update('lastGithubRepos', [...history, repoSlug].slice(0, HISTORY_ITEMS_LIMIT))
    await openSelectedDirectory(join(cwd, dirName), forceOpenNewWindow)
}

export const openSelectedDirectory = async (dirPath: string, forceOpenNewWindow?: boolean) => {
    const whereToOpen = getExtensionSetting('whereToOpen')
    const folderUri = vscode.Uri.file(dirPath)
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
