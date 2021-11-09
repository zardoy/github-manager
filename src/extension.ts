import path from 'path'
import { getGithubRemoteInfo } from 'github-remote-info'
import { defaultsDeep } from 'lodash'
import { SetRequired } from 'type-fest'
import vscode from 'vscode'
import {
    CommandHandler,
    extensionCtx,
    getExtensionSetting,
    registerAllExtensionCommands,
    RegularCommands,
    Settings,
    showQuickPick,
    VSCodeQuickPickItem,
} from 'vscode-framework'
import { openAtGithub } from './openAtGithub'
import { getReposDir, getWhereToOpen, openSelectedDirectory } from './util'
import { getDirsFromCwd } from './utils/git'

export async function activate(ctx: vscode.ExtensionContext) {
    if (getExtensionSetting('sortBy') === 'recentlyOpened') {
        extensionCtx.globalState.setKeysForSync(['lastGithubRepos'])
    }

    // TODO fix that
    type FixedCommands = Exclude<keyof RegularCommands, `${string}Active${string}`>
    const openCommandHandler: CommandHandler = async ({ command }) => {
        const placeholders: Record<Exclude<FixedCommands, 'openAtGithub'>, string> = {
            openGithubRepos: 'Select repository to open',
            openNonGitDirs: 'Select non-git directory to open',
            openNonRemoteRepos: 'Select non-remote git directory to open',
            openEverything: 'Select directory or repository to open',
        }
        await openNewDirectory({
            getDirectories: async () => {},
            quickPickOptions: {
                placeHolder: placeholders[command],
            },
        })
    }

    registerAllExtensionCommands({
        openEverything: openCommandHandler,
        openGithubRepos: openCommandHandler,
        openNonGitDirs: openCommandHandler,
        openNonRemoteRepos: openCommandHandler,
        openAtGithub,
    } as Record<FixedCommands, CommandHandler> as any)

    // repo-forked
}

const askOpenInNewWindow = async () =>
    showQuickPick([
        { label: '$(activate-breakpoints) Open in new window', value: true },
        { label: '$(circle-outline) Open in current window', value: false },
    ])

type MaybePromise<T> = T | Promise<T>

interface Options {
    /** @returns with returnValue = relative path from default dir */
    getDirectories: () => MaybePromise<Array<VSCodeQuickPickItem<string>>>
    quickPickOptions: SetRequired<vscode.QuickPickOptions, 'placeHolder'>
}

const openNewDirectory = async ({ getDirectories, quickPickOptions }: Options) => {
    const whereToOpen = getWhereToOpen() as Settings['whereToOpen']
    let forceOpenNewWindow: undefined | boolean

    if (whereToOpen === 'ask(before)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    const items = await getDirectories()

    const dirName = await showQuickPick(
        items,
        defaultsDeep(
            {
                matchOnDescription: true,
            },
            quickPickOptions,
        ),
    )
    if (!dirName) return

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow()
        if (result === undefined) return
        forceOpenNewWindow = result
    }

    console.log(forceOpenNewWindow)

    await openSelectedDirectory(dirName, forceOpenNewWindow)
}

// TODO: implement commands
// {
//     command: 'open-github-forked-repos',
//     title: 'Open Forked Cloned GitHub Repository'
// },
