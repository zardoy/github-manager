import path from 'path'
import { getGithubRemoteInfo } from 'github-remote-info'
import _ from 'lodash'
import vscode from 'vscode'
import { GracefulCommandError } from 'vscode-framework'
import { getDirsFromCwd } from './utils/git'

// actually copy-pasted from zardoy/rename-repos/src/common.ts

export const getWhereToOpen = (): string => vscode.workspace.getConfiguration('github-manager').get('whereToOpen')!
export interface GithubRepo {
    owner: string
    name: string
    /** Relative directory path from defaultCloneDirectory */
    dirPath: string
}

export function getReposDir() {
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
                            title: 'Select directory that contains your cloned GitHub repositories',
                        })
                        await vscode.workspace.getConfiguration('git').update('defaultCloneDirectory', path)
                    },
                },
            ],
        })
    return gitDefaultDir
}

export const openSelectedDirectory = async (dirPath: GithubRepo['dirPath'], forceOpenNewWindow?: boolean) => {
    const gitDefaultDir = getReposDir()
    const whereToOpen = getWhereToOpen()
    const folderUri = vscode.Uri.file(path.join(gitDefaultDir, dirPath))
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
