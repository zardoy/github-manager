import { join } from 'path'
import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, GracefulCommandError, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill'
import { getDirectoriesToShow } from './getDirs'
import execa from 'execa'

const askOpenInNewWindow = async () =>
    showQuickPick([
        { label: '$(activate-breakpoints) Open in new window', value: true },
        { label: '$(circle-outline) Open in current window', value: false },
    ])

interface Options {
    /** @returns with returnValue = relative path from default dir */
    getDirectories: (abortSignal: AbortSignal) => ReturnType<typeof getDirectoriesToShow>
    quickPickOptions: Pick<vscode.QuickPickOptions, 'title'>
}

const HISTORY_ITEMS_LIMIT = 30

export const cloneOrOpenDirectory = async ({ getDirectories, quickPickOptions }: Options) => {
    const whereToOpen = getExtensionSetting('whereToOpen')
    let forceOpenNewWindow: undefined | boolean

    if (whereToOpen === 'ask(before)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    type ItemType = {
        dirName?: string
        repoSlug?: string
    }

    // TODO vscode-extra: refactor with first arg promise
    const quickPick = vscode.window.createQuickPick<VSCodeQuickPickItem<ItemType>>()
    quickPick.busy = true
    quickPick.title = quickPickOptions.title
    quickPick.show()
    const abortController: AbortController = new AbortController()
    const { dispose: disposePrevOnDispose } = quickPick.onDidHide(() => {
        abortController.abort()
        quickPick.dispose()
    })
    console.time('Get Directories')
    const { directories, cwd, history } = await getDirectories(abortController.signal)
    console.timeEnd('Get Directories')

    quickPick.items = directories.map(({ dirName, displayName, description, repoSlug }) => ({ label: displayName, value: { dirName, repoSlug }, description }))
    quickPick.busy = false

    // copied from vscode-extra
    const selected = await new Promise<ItemType | undefined>(resolve => {
        disposePrevOnDispose()
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
    })
    if (!selected) return
    const { dirName, repoSlug } = selected

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    if (getExtensionSetting('boostRecentlyOpened'))
        await extensionCtx.globalState.update('lastGithubRepos', [...history, repoSlug].slice(0, HISTORY_ITEMS_LIMIT))
    if (dirName) {
        await openSelectedDirectory(join(cwd, dirName), forceOpenNewWindow)
    } else {
        const cloneUrl = `https://github.com/${repoSlug}.git`
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Cloning ${cloneUrl}`, cancellable: true },
                async (_, token) => {
                    const [owner, name] = repoSlug!.split('/')
                    const process = execa(
                        'git',
                        ['clone', cloneUrl, ...(getExtensionSetting('onlineRepos.clonedDirFormat') === 'repoOwner_repoName' ? [`${owner}_${name}`] : [])],
                        { cwd },
                    )
                    token.onCancellationRequested(() => process.kill())
                    await process
                },
            )
            openSelectedDirectory()
        } catch (err) {
            throw new GracefulCommandError(`Failed to clone ${cloneUrl}: ${err.message}`, { modal: true })
        }
    }
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
