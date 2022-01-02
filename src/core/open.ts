import { join } from 'path'
import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, GracefulCommandError, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import execa from 'execa'
import createStore from 'zustand/vanilla'
import { Except } from 'type-fest'
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js'
import fileSize from 'filesize'
import { DirectoryDisplayItem, getDirectoriesToShow, GetDirsParams, GetDirsYields } from './getDirs'

// TODO should also work with dirs
const askOpenInNewWindow = async (repoSlug?: string) =>
    showQuickPick(
        [
            { label: '$(activate-breakpoints) Open in new window', value: true },
            { label: '$(circle-outline) Open in current window', value: false },
        ],
        { title: repoSlug && `Where to open ${repoSlug}` },
    )

type Options = Pick<GetDirsParams, 'selectedDirs' | 'openWithRemotesCommand' | 'cwd'> & {
    quickPickOptions: Pick<vscode.QuickPickOptions, 'title'>
    args: {
        initiallyShowForks: boolean | 'only'
        ownerFilter?: string
        // only for remote command
        notClonedOnly: boolean
    }
}

const HISTORY_ITEMS_LIMIT = 30

/** `getDirectoriesToShow` wrapper with more vscode API quickPick with handlining opening */
export const cloneOrOpenDirectory = async ({ cwd, quickPickOptions, args, openWithRemotesCommand, selectedDirs }: Options) => {
    const { initiallyShowForks, notClonedOnly, ownerFilter } = args
    const whereToOpen = getExtensionSetting('whereToOpen')
    // with any setting value, reuse empty windows
    let forceOpenNewWindow: undefined | boolean = isWindowEmpty() ? false : undefined

    if (forceOpenNewWindow === undefined && whereToOpen === 'ask(before)') {
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
        showForks: true as Options['args']['initiallyShowForks'],
    }))

    /** Items without filter */
    let sourceItems: DirectoryDisplayItem[] = []
    // TODO into state
    const triggerItemsUpdate = () => {
        // Do not reset selected index to the start
        // This should be default behavior...
        const activeItemSlug = quickPick.activeItems[0]?.value.repoSlug
        quickPick.items = sourceItems
            .map(({ displayName, description, ...value }) => {
                // TODO more clean solution
                const isFork = description?.includes('$(repo-forked)')
                const showForksState = buttonsState.getState().showForks
                if (isFork && showForksState === false) return undefined!
                if (!isFork && showForksState === 'only') return undefined!
                if (notClonedOnly && !displayName.includes('$(globe)')) return undefined!
                if (ownerFilter && value.repoSlug && !value.repoSlug.startsWith(`${ownerFilter}/`)) return undefined!

                return {
                    label: displayName,
                    value,
                    description,
                }
            })
            .filter(a => a !== undefined)
        const newActiveItem = activeItemSlug && quickPick.items.find(({ value: { repoSlug } }) => activeItemSlug === repoSlug)
        if (newActiveItem) quickPick.activeItems = [newActiveItem]
    }

    type QuickPickButton = vscode.QuickInputButton & { action: 'toggle-forks-visibility' | 'open-github' | 'reveal-in-explorer' }

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
        // TODO hide them
        const quickPickButtons: QuickPickButton[] = [
            {
                iconPath: new vscode.ThemeIcon('folder'),
                // no web target
                tooltip: `Reveal in ${process.platform === 'darwin' ? 'finder' : 'explorer'}`,
                action: 'reveal-in-explorer',
            },
        ]
        if (Object.keys(selectedDirs).includes('github'))
            quickPickButtons.push(
                {
                    iconPath: new vscode.ThemeIcon('globe'),
                    tooltip: 'Open on GitHub',
                    action: 'open-github',
                },
                { ...stateButtons[String(state.showForks)], action: 'toggle-forks-visibility' },
            )
        quickPick.buttons = quickPickButtons
    })
    buttonsState.setState({ showForks: initiallyShowForks })
    // quickPick.ignoreFocusOut = true
    //@ts-expect-error TODO
    quickPick.onDidTriggerButton(async (button: QuickPickButton) => {
        const { action } = button
        if (action === 'open-github' || action === 'reveal-in-explorer') {
            const activeItem = quickPick.activeItems[0]
            if (!activeItem) return
            if (action === 'open-github' && activeItem.value.repoSlug)
                await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${activeItem.value.repoSlug}`))
            else if (action === 'reveal-in-explorer' && 'dirName' in activeItem.value)
                await vscode.env.openExternal(vscode.Uri.file(join(cwd, activeItem.value.dirName)))
        } else {
            const statesCycle = [true, 'only', false] as Array<Options['args']['initiallyShowForks']>
            buttonsState.setState(({ showForks }) => ({
                showForks: statesCycle[statesCycle.indexOf(showForks) + 1] ?? statesCycle[0],
            }))
            triggerItemsUpdate()
        }
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
                sourceItems = (directoriesUntyped as GetDirsYields<'directories'>).directories
                triggerItemsUpdate()
            }

            console.timeEnd('Get all directories')
            quickPick.busy = false
            // TODO! no items item
        })()
    })
    abortController.abort()
    console.timeEnd('Get all directories')
    if (!selectedItem) return

    if (forceOpenNewWindow === undefined && whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow(selectedItem.repoSlug)
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    if (history && selectedItem.repoSlug) {
        const newLastOpenedRepos = [...new Set([selectedItem.repoSlug, ...history.slice(-HISTORY_ITEMS_LIMIT + 1).reverse()])].reverse()
        await extensionCtx.globalState.update('lastGithubRepos', newLastOpenedRepos)
        console.log('Updated history of last opened repos', newLastOpenedRepos)
    }

    if ('dirName' in selectedItem && selectedItem.dirName) {
        await openSelectedDirectory(join(cwd, selectedItem.dirName), forceOpenNewWindow)
    } else if (selectedItem.type === 'remote') {
        let shallowClone = false
        const REPO_SIZE_THRESHOLD_KB = 50 * 1024 // 50 MB
        const { repoSlug, diskUsage } = selectedItem
        if (diskUsage > REPO_SIZE_THRESHOLD_KB) {
            const response = await vscode.window.showWarningMessage(
                'Cloning repository is big',
                { modal: true, detail: `${repoSlug} size on GitHub is ${fileSize(diskUsage * 1024)}. Use shallow clone (--depth=1)?` },
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

export const isWindowEmpty = () => {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) return false
    // TODO migrate to tabs API when available
    const visibleTextEditors = vscode.window.visibleTextEditors.filter(({ viewColumn }) => viewColumn !== undefined)
    // suppose no opened tabs
    return visibleTextEditors.length === 0
}

export const openSelectedDirectory = async (dirPath: string, forceOpenNewWindow?: boolean) => {
    const whereToOpen = getExtensionSetting('whereToOpen')
    const folderUri = vscode.Uri.file(dirPath)
    const forceNewWindow = (() => {
        if (forceOpenNewWindow !== undefined) return forceOpenNewWindow
        if (whereToOpen === 'alwaysSameWindow') return false
        if (whereToOpen === 'newWindowIfNotEmpty') return !isWindowEmpty()
        return false
    })()
    await vscode.commands.executeCommand('vscode.openFolder', folderUri, {
        forceNewWindow,
    })
}
