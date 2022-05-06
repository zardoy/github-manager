/* eslint-disable unicorn/no-await-expression-member */
/* eslint-disable sonarjs/no-duplicate-string */
import { join } from 'path'
import * as vscode from 'vscode'
import {
    extensionCtx,
    getExtensionContributionsPrefix,
    getExtensionSetting,
    GracefulCommandError,
    registerExtensionCommand,
    RegularCommands,
    showQuickPick,
    VSCodeQuickPickItem,
} from 'vscode-framework'
import execa from 'execa'
import { proxy, subscribe } from 'valtio/vanilla'
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

/** `getDirectoriesToShow` wrapper with more vscode API quickPick with handlining opening */
// eslint-disable-next-line complexity
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
    Object.assign(quickPick, quickPickOptions)
    quickPick.matchOnDescription = true
    // quickPick.keepScrollPosition = true
    const buttonsState = proxy({
        // setting the actual value later to invoke the subscriber
        showForks: initiallyShowForks,
    })

    /** Items without filter */
    let sourceItems: DirectoryDisplayItem[] = []
    type ItemButton = vscode.QuickInputButton & {
        click(item)
    }

    // TODO into state
    const triggerItemsUpdate = () => {
        // Do not reset selected index to the start
        // This should be default behavior...
        const activeItemSlug = quickPick.activeItems[0]?.value.repoSlug
        quickPick.items = sourceItems
            .map(({ displayName, description, ...value }): VSCodeQuickPickItem<ItemType> => {
                // TODO more clean solution
                const isFork = description?.includes('$(repo-forked)')
                const showForksState = buttonsState.showForks
                if (isFork && showForksState === false) return undefined!
                if (!isFork && showForksState === 'only') return undefined!
                if (notClonedOnly && !displayName.includes('$(globe)')) return undefined!
                if (ownerFilter && value.repoSlug && !value.repoSlug.startsWith(`${ownerFilter}/`)) return undefined!

                const itemButtons: ItemButton[] = []
                if (value.repoSlug)
                    itemButtons.push({
                        iconPath: new vscode.ThemeIcon('globe'),
                        tooltip: 'Open at GitHub',
                        async click() {
                            await vscode.env.openExternal(`https://github.com/${value.repoSlug!}` as any)
                        },
                    })
                if ('dirName' in value && value.dirName)
                    itemButtons.push({
                        iconPath: new vscode.ThemeIcon('folder'),
                        tooltip: `Reveal in ${process.platform === 'darwin' ? 'finder' : 'explorer'}`,
                        async click() {
                            await vscode.env.openExternal(vscode.Uri.file(join(cwd, value.dirName)))
                        },
                    })

                return {
                    label: displayName,
                    value,
                    description,
                    buttons: itemButtons,
                }
            })
            .filter(a => a !== undefined)
        const newActiveItem = activeItemSlug && quickPick.items.find(({ value: { repoSlug } }) => activeItemSlug === repoSlug)
        if (newActiveItem) quickPick.activeItems = [newActiveItem]
    }

    const updateButtonsState = () => {
        const getButtonIcon = (variant: string) =>
            Object.fromEntries(
                ['dark', 'light'].map(type => [type, vscode.Uri.file(extensionCtx.asAbsolutePath(`./resources/quickpick-icons/${variant}/${type}.svg`))]),
            )
        const stateButtons: Record<`${typeof buttonsState['showForks']}`, vscode.QuickInputButton> = {
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
        quickPick.buttons = [{ ...stateButtons[String(buttonsState.showForks)], action: 'toggle-forks-visibility' }]
    }

    updateButtonsState()
    subscribe(buttonsState, updateButtonsState)

    // quickPick.ignoreFocusOut = true
    quickPick.onDidTriggerButton(() => {
        // we have only one filter button
        const statesCycle = [true, 'only', false] as Array<Options['args']['initiallyShowForks']>
        buttonsState.showForks = statesCycle[statesCycle.indexOf(buttonsState.showForks) + 1] ?? statesCycle[0]
        triggerItemsUpdate()
    })
    quickPick.onDidTriggerItemButton(({ item, button: triggeredButton }) => {
        for (const itemButton of item.buttons! as ItemButton[]) {
            if (itemButton !== triggeredButton) continue
            itemButton.click(item)
        }
    })

    quickPick.show()
    await vscode.commands.executeCommand('setContext', 'github-manager.inQuickPick', true)
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
        const acceptCurrent = () => {
            // align with default showQuickPick behavior
            if (quickPick.items.length === 0) return
            const { activeItems } = quickPick
            resolve(activeItems[0]?.value)
            quickPick.hide()
        }

        const registerCommand = (command: keyof RegularCommands, handler: () => void) =>
            vscode.commands.registerCommand(`${getExtensionContributionsPrefix()}${command}`, handler)
        const commandsDisposable = vscode.Disposable.from(
            registerCommand('forceOpenInNewWindow', () => {
                forceOpenNewWindow = true
                acceptCurrent()
            }),
            registerCommand('forceOpenInTheSameWindow', () => {
                forceOpenNewWindow = false
                acceptCurrent()
            }),
        )
        quickPick.onDidHide(() => {
            resolve(undefined)
            commandsDisposable.dispose()
            quickPick.dispose()
        })
        quickPick.onDidAccept(acceptCurrent)

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
    await vscode.commands.executeCommand('setContext', 'github-manager.inQuickPick', false)
    if (!selectedItem) return

    if (forceOpenNewWindow === undefined && whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow(selectedItem.repoSlug)
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    if (history && selectedItem.repoSlug) {
        const lastOpenedItemsLimit = getExtensionSetting('lastOpenedItemsLimit')
        const newLastOpenedRepos = [...new Set([selectedItem.repoSlug, ...history.slice(-lastOpenedItemsLimit + 1).reverse()])].reverse()
        await extensionCtx.globalState.update('lastGithubRepos', newLastOpenedRepos)
        console.log('Updated history of last opened repos', newLastOpenedRepos)
    }

    if ('dirName' in selectedItem && selectedItem.dirName) {
        await openSelectedDirectory(join(cwd, selectedItem.dirName), forceOpenNewWindow)
    } else if (selectedItem.type === 'remote') {
        let shallowClone = false
        const { repoSlug, diskUsage } = selectedItem
        const repoSizeThreshold = getExtensionSetting('repoSizeThreshold')
        if (repoSizeThreshold !== 0 && diskUsage > repoSizeThreshold) {
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
            let title = `Cloning ${cloneUrl}`
            if (shallowClone) title += ' (--depth=1)'
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, async (_, token) => {
                // TODO show progress
                const process = execa('git', ['clone', cloneUrl, cloneDirName, ...(shallowClone ? ['--depth=1'] : [])], { cwd })
                token.onCancellationRequested(() => process.kill())
                await process
            })
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
    const windowEmpty =
        vscode.window.tabGroups.all.reduce((sum, tabs) => sum + tabs.tabs.length, 0) ||
        vscode.window.tabGroups.all.every(item =>
            item.tabs.every(tab => tab.label.match(/Untitled-\d+/) && (tab.input as any).uri.toString().match(/untitled:Untitled-\d+/)),
        )
    return windowEmpty
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
