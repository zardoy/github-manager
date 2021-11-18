import fs from 'fs'
import path from 'path'
import { fromUrl } from 'hosted-git-info'
import vscode from 'vscode'
import { getExtensionCommandId, GracefulCommandError } from 'vscode-framework'
import type { OpenCommands } from '../extension'

// can we improve performance or is it good enough? (nah, it's not)
export const getDirsFromCwd = async (cwd: string) => {
    const dirs: Record<'git' | 'nonGit', string[]> = { git: [], nonGit: [] }
    const dirsList = await fs.promises.readdir(cwd)
    for (const dirName of dirsList) {
        if (!fs.lstatSync(path.join(cwd, dirName)).isDirectory()) continue

        const gitPath = path.join(cwd, dirName, '.git')
        const isGitDir = fs.existsSync(gitPath) && fs.lstatSync(gitPath).isDirectory()
        ;(isGitDir ? dirs.git : dirs.nonGit).push(dirName)
    }

    return dirs
}

// actually copy-pasted from zardoy/rename-repos/src/common.ts

export function getReposDir(openCommand: OpenCommands) {
    const gitDefaultDir: string | undefined | null = vscode.workspace.getConfiguration('git').get('defaultCloneDirectory')
    if (!gitDefaultDir)
        throw new GracefulCommandError('git.defaultCloneDirectory is not set. Point it to directory with your GitHub repositories', {
            actions: [
                {
                    label: 'Specify with modal',
                    async action() {
                        const dirsPath = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            // TODO documents on both, except linux
                            // defaultUri: ,
                            openLabel: 'Select',
                            title: 'Select directory with cloned GitHub repositories',
                        })
                        if (dirsPath === undefined) return
                        await vscode.workspace.getConfiguration('git').update('defaultCloneDirectory', dirsPath[0]!.fsPath, vscode.ConfigurationTarget.Global)
                        await vscode.commands.executeCommand(getExtensionCommandId(openCommand))
                    },
                },
            ],
        })
    return gitDefaultDir
}

export function parseGithubRemoteUrl(remoteUrl: string) {
    const remoteParsed = fromUrl(remoteUrl)
    if (!remoteParsed || remoteParsed.domain !== 'github.com') return undefined

    return {
        owner: remoteParsed.user,
        name: remoteParsed.project,
    }
}

export function getRepoSlug({ owner, name }: Record<'owner' | 'name', string>) {
    return `${owner}/${name}`
}

export function getRepoFromSlug(slug: string) {
    const [owner, name] = slug.split('/')
    return { owner, name }
}
