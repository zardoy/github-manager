/* eslint-disable zardoy-config/unicorn/prefer-regexp-test */
import path from 'path'
import { getGithubRemoteInfo } from 'github-remote-info'
import _ from 'lodash'
import { extensionCtx, getExtensionSetting } from 'vscode-framework'
import { getDirsFromCwd, GithubRepo } from './git'
import { findDuplicatesBy, normalizeRegex } from './util'
const icons = {
    github: '$(github-inverted)',
    nonGit: '$(file-directory)',
    nonRemote: '$(git-branch)',
}

// github-forked
// github-non-forked
export type DirectoryType = 'github' | 'non-git' | 'non-remote'
interface DirectoryDisplayItem {
    dirName: string
    displayName: string
    description?: string
}

/** Returns dirs, ready to show in quickPick */
// eslint-disable-next-line complexity
export const getDirectoriesToShow = async (
    cwd: string,
    selectedDirs: Partial<Record<DirectoryType, boolean>>,
): Promise<{ cwd: string; directories: DirectoryDisplayItem[]; history: string[] }> => {
    const directories: DirectoryDisplayItem[] = []
    // const githubDirectories: Array<Record<'owner' | 'name' | ''
    /** history holds repos slug */
    let history: string[] = []

    let { git: gitDirs, nonGit: nonGitDirs } = await getDirsFromCwd(cwd)

    if (getExtensionSetting('sortBy') === 'lastModified') {
        // TODO use github integration
        const d = 5
        // const newIndexes = {
        //     git: [] as string[],
        //     nonGit: [] as string[],
        // }
        // for (const dir of await getLastModifiedDirs(cwd)) {
        //     const gitDir = gitDirs.find(gitDir => gitDir === dir)
        //     if (gitDir) {
        //         newIndexes.git.push(gitDir)
        //         continue
        //     }

        //     const nonGitDir = nonGitDirs.find(nonGitDir => nonGitDir === dir)
        //     if (nonGitDir) {
        //         newIndexes.nonGit.push(nonGitDir)
        //         continue
        //     }
        // }

        // gitDirs = newIndexes.git
        // nonGitDirs = newIndexes.nonGit
    }

    const ignoreRegexp = normalizeRegex(getExtensionSetting('ignore.dirNameRegex'))
    if (ignoreRegexp) {
        gitDirs = gitDirs.filter(dirName => !dirName.match(ignoreRegexp))
        nonGitDirs = nonGitDirs.filter(dirName => !dirName.match(ignoreRegexp))
    }

    if (selectedDirs.github || selectedDirs['non-remote']) {
        const dirsOriginInfo = await Promise.allSettled(gitDirs.map(async dir => getGithubRemoteInfo(path.join(cwd, dir))))

        if (selectedDirs.github) {
            let reposWithGithubInfo = dirsOriginInfo
                .map((state, index): GithubRepo | undefined => {
                    if (state.status === 'fulfilled') return state.value ? { ...state.value, dirPath: gitDirs[index] } : undefined

                    return undefined
                })
                .filter(Boolean) as GithubRepo[]
            if (getExtensionSetting('sortBy') === 'byOwner') {
                // desc
                const reposByOwner = Object.values(_.groupBy(reposWithGithubInfo, r => r.owner)).sort((a, b) => b.length - a.length)
                /** sorted by name of repo */
                const reposByOwnerSorted = reposByOwner.map(repos => _.sortBy(repos, r => r.name))
                reposWithGithubInfo = reposByOwnerSorted.flat(1)
            }

            if (getExtensionSetting('sortBy') === 'recentlyOpened') {
                history = extensionCtx.globalState.get('lastGithubRepos') ?? []
                // TODOOO
                for (const repoSlug of history) {
                    const [owner, name] = repoSlug.split('/')
                    const repoIndex = reposWithGithubInfo.findIndex(repo => repo.owner === owner && repo.name === name)
                    if (repoIndex === -1) continue
                    reposWithGithubInfo.unshift(reposWithGithubInfo[repoIndex])
                    reposWithGithubInfo.splice(repoIndex + 1, 1)
                }
            }

            const ignoreUsers = getExtensionSetting('ignore.users') as string[]
            reposWithGithubInfo = reposWithGithubInfo.filter(({ owner }) => !ignoreUsers.includes(owner))

            directories.push(
                ...reposWithGithubInfo.map(({ dirPath, name, owner }) => ({
                    displayName: `${icons.github} ${owner}/${name}`,
                    dirName: dirPath,
                    ...(getExtensionSetting('showFolderNames') === 'always' ? { description: dirPath } : {}),
                })),
            )
        }

        if (selectedDirs['non-remote']) {
            const reposWithoutRemote = dirsOriginInfo
                .map((info, index) => (info.status === 'fulfilled' && info.value === undefined ? gitDirs[index] : undefined))
                .filter(Boolean) as string[]
            directories.push(
                ...reposWithoutRemote.map(name => ({
                    displayName: `${icons.nonRemote} ${name}`,
                    dirName: name,
                })),
            )
        }
    }

    if (selectedDirs['non-git'])
        directories.push(
            ...nonGitDirs.map(name => ({
                displayName: `${icons.nonGit} ${name}`,
                dirName: name,
            })),
        )

    if (getExtensionSetting('showFolderNames') === 'onDuplicates')
        for (const [, indexes] of findDuplicatesBy(directories, ({ displayName }) => displayName))
            for (const i of indexes) directories[i].description = directories[i].dirName

    if (getExtensionSetting('reverseList')) directories.reverse()

    return {
        cwd,
        directories,
        history,
    }
}
