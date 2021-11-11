import vscode from 'vscode'
import { CommandHandler, extensionCtx, getExtensionSetting, registerAllExtensionCommands, RegularCommands } from 'vscode-framework'
import { DirectoryType, getDirectoriesToShow } from './core/getDirs'
import { getReposDir } from './core/git'
import { openNewDirectory } from './core/open'
import { openAtGithub } from './openAtGithub'

export async function activate() {
    if (getExtensionSetting('sortBy') === 'recentlyOpened') extensionCtx.globalState.setKeysForSync(['lastGithubRepos'])

    const openCommandHandler: CommandHandler = async ({ command }) => {
        const titles: Record<OpenCommands, string> = {
            openGithubRepository: 'Select repository to open',
            openNonGitDirectory: 'Select non-git directory to open',
            openNonRemoteRepository: 'Select non-remote git directory to open',
            openEverything: 'Select directory or repository to open',
        }
        const commandDirectoryTypeMap: Record<Exclude<OpenCommands, 'openEverything'>, DirectoryType> = {
            openGithubRepository: 'github',
            openNonGitDirectory: 'non-git',
            openNonRemoteRepository: 'non-remote',
        }
        await openNewDirectory({
            getDirectories: async () =>
                getDirectoriesToShow(
                    getReposDir(command as OpenCommands),
                    command === 'openEverything' ? { 'non-git': true, 'non-remote': true, github: true } : { [commandDirectoryTypeMap[command]]: true },
                ),
            quickPickOptions: {
                title: titles[command],
            },
        })
    }

    registerAllExtensionCommands({
        openGithubRepository: openCommandHandler,
        openNonGitDirectory: openCommandHandler,
        openNonRemoteRepository: openCommandHandler,
        openEverything: openCommandHandler,
        openAtGithub,
    })

    // repo-forked
}

export type OpenCommands = Exclude<keyof RegularCommands, 'openAtGithub'>
