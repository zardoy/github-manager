import { join } from 'path'
import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, GracefulCommandError, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import execa from 'execa'
import createStore from 'zustand/vanilla'
import { Except } from 'type-fest'
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js'
import { DirectoryDisplayItem, getDirectoriesToShow, GetDirsParams } from './getDirs'

const askOpenInNewWindow = async () =>
    showQuickPick([
        { label: '$(activate-breakpoints) Open in new window', value: true },
        { label: '$(circle-outline) Open in current window', value: false },
    ])

type Options = Pick<GetDirsParams, 'selectedDirs' | 'openWithRemotesCommand' | 'cwd'> & {
    quickPickOptions: Pick<vscode.QuickPickOptions, 'title'>
    initiallyShowForks: boolean | 'only'
}

const HISTORY_ITEMS_LIMIT = 30

/** `getDirectoriesToShow` wrapper with more vscode API quickPick with handlining opening */
export const cloneOrOpenDirectory = async ({ cwd, quickPickOptions, initiallyShowForks, openWithRemotesCommand, selectedDirs }: Options) => {
    const whereToOpen = getExtensionSetting('whereToOpen')
    let forceOpenNewWindow: undefined | boolean

    if (whereToOpen === 'ask(before)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    type ItemType = Except<DirectoryDisplayItem, 'displayName' | 'description'>

    // TODO vscode-extra: refactor with first arg promise
    const quickPick = vscode.window.createQuickPick<VSCodeQuickPickItem<ItemType>>()
    quickPick.busy = true
    quickPick.title = quickPickOptions.title
    quickPick.matchOnDescription = true
    const buttonsState = createStore(() => ({
        // setting the actual value later to invoke the subscriber
        showForks: true as Options['initiallyShowForks'],
    }))

    buttonsState.subscribe(state => {
        const getButtonIcon = (variant: string) =>
            Object.fromEntries(
                ['dark', 'light'].map(type => [type, vscode.Uri.file(extensionCtx.asAbsolutePath(`./resources/quickpick-icons/${variant}/${type}.svg`))]),
            )
        const stateButtons: Record<`${typeof state['showForks']}`, vscode.QuickInputButton> = {
            true: {
                iconPath: new vscode.ThemeIcon('repo-forked'),
                tooltip: 'Forks are visible',
            },
            false: {
                iconPath: getButtonIcon('forks-hidden'),
                tooltip: 'Forks are hidden',
            },
            only: {
                iconPath: getButtonIcon('forks-only'),
                tooltip: 'Only forks are visible',
            },
        }
        quickPick.buttons = [stateButtons[String(state.showForks)]]
    })
    buttonsState.setState({ showForks: initiallyShowForks })
    // quickPick.ignoreFocusOut = true
    quickPick.onDidTriggerButton(() => {
        const statesCycle = [true, 'only', false] as Array<Options['initiallyShowForks']>
        buttonsState.setState(({ showForks }) => ({
            showForks: statesCycle[statesCycle.indexOf(showForks) + 1] ?? statesCycle[0],
        }))
    })

    quickPick.show()
    const abortController = new AbortController()
    const { dispose: disposePrevOnDispose } = quickPick.onDidHide(() => {
        abortController.abort()
        quickPick.dispose()
    })
    console.time('Get Directories')
    const { directories, history } = await getDirectoriesToShow({
        cwd,
        selectedDirs,
        openWithRemotesCommand,
        abortSignal: abortController.signal,
    }).finally(() => console.timeEnd('Get Directories'))

    quickPick.items = directories.map(({ displayName, description, ...value }) => ({ label: displayName, value, description }))
    quickPick.busy = false

    // copied from vscode-extra
    const selectedItem = await new Promise<ItemType | undefined>(resolve => {
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
    if (!selectedItem) return

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    if (getExtensionSetting('boostRecentlyOpened') && selectedItem.repoSlug)
        await extensionCtx.globalState.update('lastGithubRepos', [...history, selectedItem.repoSlug].slice(0, HISTORY_ITEMS_LIMIT))

    if (selectedItem.type === 'local') {
        await openSelectedDirectory(join(cwd, selectedItem.dirName), forceOpenNewWindow)
    } else {
        const { repoSlug } = selectedItem
        const cloneUrl = `https://github.com/${repoSlug}.git`
        try {
            const [owner, name] = repoSlug.split('/')
            const cloneDirName = getExtensionSetting('onlineRepos.clonedDirFormat') === 'repoOwner_repoName' ? `${owner}_${name}` : name
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Cloning ${cloneUrl}`, cancellable: true },
                async (_, token) => {
                    // TODO show progress
                    const process = execa('git', ['clone', cloneUrl, cloneDirName], { cwd })
                    token.onCancellationRequested(() => process.kill())
                    await process
                },
            )
            await openSelectedDirectory(cloneDirName, forceOpenNewWindow)
        } catch (error) {
            throw new GracefulCommandError(`Failed to clone ${cloneUrl}: ${error.message}`, { modal: true })
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
