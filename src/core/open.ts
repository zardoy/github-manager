import { join } from 'path'
import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, GracefulCommandError, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import execa from 'execa'
import createStore from 'zustand/vanilla'
import { Except } from 'type-fest'
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js'
import fileSize from 'filesize'
import { DirectoryDisplayItem, getDirectoriesToShow, GetDirsParams, GetDirsYields } from './getDirs'

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
        // TODO more buttons
        const statesCycle = [true, 'only', false] as Array<Options['initiallyShowForks']>
        buttonsState.setState(({ showForks }) => ({
            showForks: statesCycle[statesCycle.indexOf(showForks) + 1] ?? statesCycle[0],
        }))
    })

    quickPick.show()
    const abortController = new AbortController()

    const dirsGenerator = getDirectoriesToShow({
        cwd,
        selectedDirs,
        openWithRemotesCommand,
        abortSignal: abortController.signal,
    })
    const { history } = (await dirsGenerator.next()).value as GetDirsYields<'history'>

    // copied from vscode-extra
    const selectedItem = await new Promise<ItemType | undefined>(resolve => {
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

        console.time('Get all directories')
        void (async () => {
            for await (const directoriesUntyped of dirsGenerator) {
                // Do not reset selected index to the start
                const activeItemSlug = quickPick.activeItems[0]?.value.repoSlug
                quickPick.items = (directoriesUntyped as GetDirsYields<'directories'>).directories.map(({ displayName, description, ...value }) => ({
                    label: displayName,
                    value,
                    description,
                }))
                // repostiory can't be removed so find with non-null assertion
                if (activeItemSlug) quickPick.activeItems = [quickPick.items.find(({ value: { repoSlug } }) => activeItemSlug === repoSlug)!]
            }

            console.timeEnd('Get all directories')
            quickPick.busy = false
        })()
    })
    abortController.abort()
    console.timeEnd('Get all directories')
    if (!selectedItem) return

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    if (history && selectedItem.repoSlug)
        await extensionCtx.globalState.update('lastGithubRepos', [...history, selectedItem.repoSlug].slice(0, HISTORY_ITEMS_LIMIT))

    if ('dirName' in selectedItem && selectedItem.dirName) {
        await openSelectedDirectory(join(cwd, selectedItem.dirName), forceOpenNewWindow)
    } else if (selectedItem.type === 'remote') {
        let shallowClone = false
        const REPO_SIZE_THRESHOLD_KB = 50 * 1024 // 50MG
        const { repoSlug, diskUsage } = selectedItem
        if (diskUsage > REPO_SIZE_THRESHOLD_KB) {
            const response = await vscode.window.showWarningMessage(
                'Cloning repository is big',
                { modal: true, detail: `Repository size on GitHub is ${fileSize(diskUsage)}. Use shallow clone (--depth=1)?` },
                'Yes',
                'No',
            )
            if (response === undefined) return
            if (response === 'Yes') shallowClone = true
        }

        const cloneUrl = `https://github.com/${repoSlug}.git`
        try {
            const [owner, name] = repoSlug.split('/')
            const cloneDirName = getExtensionSetting('onlineRepos.clonedDirFormat') === 'repoOwner_repoName' ? `${owner}_${name}` : name
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Cloning ${cloneUrl}`, cancellable: true },
                async (_, token) => {
                    // TODO show progress
                    const process = execa('git', ['clone', cloneUrl, cloneDirName, ...(shallowClone ? ['--depth=1'] : [])], { cwd })
                    token.onCancellationRequested(() => process.kill())
                    await process
                },
            )
            await openSelectedDirectory(join(cwd, cloneDirName), forceOpenNewWindow)
        } catch (error) {
            throw new GracefulCommandError(`Failed to clone ${cloneUrl}: ${error.message}`, { modal: true })
        }
    } else {
        throw new Error('Unknown directory type')
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
