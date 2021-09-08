import path from 'path'
import { getGithubRemoteInfo } from 'github-remote-info'
import _ from 'lodash'
import vscode from 'vscode'
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
    if (!gitDefaultDir) throw new Error('Ensure that git.defaultCloneDirectory setting is pointing to directory with your GitHub repos')

    return gitDefaultDir
}

export const getGithubRepos = async () => {
    try {
        console.time('Show selections')
        const gitDefaultDir = getReposDir()

        const { git: gitDirs } = await getDirsFromCwd(gitDefaultDir)
        const dirsOriginInfo = await Promise.allSettled(gitDirs.map(async dir => getGithubRemoteInfo(path.join(gitDefaultDir, dir))))
        const reposWithGithubInfo = dirsOriginInfo
            .map((state, index): GithubRepo | undefined => {
                if (state.status === 'fulfilled') return state.value ? { ...state.value, dirPath: gitDirs[index] } : undefined

                return undefined
            })
            .filter(Boolean) as GithubRepo[]
        const ownerCountMap = _.countBy(reposWithGithubInfo, r => r.owner)
        // TODO sort also by name
        const sortedRepos = _.sortBy(reposWithGithubInfo, r => ownerCountMap[r.owner]).reverse()

        return sortedRepos
    } finally {
        console.timeEnd('Show selections')
    }
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
