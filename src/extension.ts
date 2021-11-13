import { Octokit } from '@octokit/rest'
import { Except } from 'type-fest'
import { CommandHandler, extensionCtx, getExtensionSetting, registerAllExtensionCommands, RegularCommands, showQuickPick } from 'vscode-framework'
import { initializeGithubAuth } from './auth'
import { DirectoryType, getDirectoriesToShow } from './core/getDirs'
import { getReposDir } from './core/git'
import { openNewDirectory } from './core/open'
import { openAtGithub } from './openAtGithub'

export async function activate() {
    void initializeGithubAuth()
    if (getExtensionSetting('boostRecentlyOpened')) extensionCtx.globalState.setKeysForSync(['lastGithubRepos'])

    const openCommandHandler: CommandHandler = async ({ command }, args = {}) => {
        interface CommandArgs {
            openGithubRepository: {
                includeForks: string
                notClonedOnly: string
            }
            openForkedGithubRepository: {
                notClonedOnly: string
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
            openClonedForkedGithubRepository: 'github',
            openClonedGithubRepository: 'github',
            openForkedGithubRepository: 'github',
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
        openAtGithub,
        ...Object.fromEntries(
            (
                [
                    'openClonedForkedGithubRepository',
                    'openClonedGithubRepository',
                    'openEverything',
                    'openForkedGithubRepository',
                    'openGithubRepository',
                    'openNonGitDirectory',
                    'openNonRemoteRepository',
                ] as OpenCommands[]
            ).map(commandName => [commandName, openCommandHandler]),
        ),
    })
}

export type OpenCommands = keyof Except<RegularCommands, 'openAtGithub'>
