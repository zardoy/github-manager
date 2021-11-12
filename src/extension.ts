import vscode from 'vscode'
import { CommandHandler, extensionCtx, getExtensionSetting, registerAllExtensionCommands, RegularCommands } from 'vscode-framework'
import { DirectoryType, getDirectoriesToShow } from './core/getDirs'
import { getReposDir } from './core/git'
import { openNewDirectory } from './core/open'
import { openAtGithub } from './openAtGithub'

export async function activate() {
    if (getExtensionSetting('sortBy') === 'recentlyOpened') extensionCtx.globalState.setKeysForSync(['lastGithubRepos'])

    const openCommandHandler: CommandHandler = async ({ command }, args = {}) => {
        interface CommandArgs {
            openGithubRepository: {
                includeForks: string
            }
            openClonedGithubRepository: {
                includeForks: boolean
                owner: string
            }
        }
        const titleMainPart: Record<OpenCommands, string> = {
            openGithubRepository: 'repository',
            openClonedGithubRepository: 'cloned repository',
            openForkedGithubRepository: 'forked repository',
            openClonedForkedGithubRepository: 'cloned forked repository',
            openNonGitDirectory: 'non-git directory',
            openNonRemoteRepository: 'non-remote git directory',
            openEverything: 'directory or repository',
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
                title: `Select ${titleMainPart[command]} to open`,
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
