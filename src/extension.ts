import { Except } from 'type-fest'
import { CommandHandler, extensionCtx, getExtensionSetting, registerAllExtensionCommands, RegularCommands } from 'vscode-framework'
import { initializeGithubAuth } from './auth'
import { DirectoryType } from './core/getDirs'
import { getReposDir } from './core/git'
import { cloneOrOpenDirectory } from './core/open'
import { openAtGithub } from './openAtGithub'

export async function activate() {
    void initializeGithubAuth()
    if (getExtensionSetting('boostRecentlyOpened')) extensionCtx.globalState.setKeysForSync(['lastGithubRepos'])

    const openCommandHandler: CommandHandler = async ({ command: commandUntyped }, { showForks = false } = {}) => {
        const command = commandUntyped as OpenCommands
        /* UNIMPLEMENTED */
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
            openNonGitDirectory: 'non-git directory',
            openNonRemoteRepository: 'non-remote git directory',
            openEverything: 'directory or repository',
        }
        const commandDirectoryTypeMap: Record<Exclude<OpenCommands, 'openEverything'>, DirectoryType> = {
            openGithubRepository: 'github',
            openClonedGithubRepository: 'github',
            openNonGitDirectory: 'non-git',
            openNonRemoteRepository: 'non-remote',
        }
        await cloneOrOpenDirectory({
            cwd: getReposDir(command),
            quickPickOptions: {
                title: `Select ${titleMainPart[command]} to open`,
            },
            initiallyShowForks: showForks,
            selectedDirs: command === 'openEverything' ? { 'non-git': true, 'non-remote': true, github: true } : { [commandDirectoryTypeMap[command]]: true },
            // only applies for commands that open repositories
            openWithRemotesCommand: command === 'openGithubRepository',
        })
    }

    const openCommands: OpenCommands[] = [
        'openClonedGithubRepository',
        'openEverything',
        'openGithubRepository',
        'openNonGitDirectory',
        'openNonRemoteRepository',
    ]

    registerAllExtensionCommands({
        openAtGithub,
        ...Object.fromEntries(openCommands.map(commandName => [commandName, openCommandHandler])),
    })
}

export type OpenCommands = keyof Except<RegularCommands, 'openAtGithub'>
