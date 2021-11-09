/* eslint-disable zardoy-config/unicorn/prefer-regexp-test */
import path from 'path'
import { getGithubRemoteInfo } from 'github-remote-info'
import _ from 'lodash'
import { RequireAtLeastOne } from 'type-fest'
import { extensionCtx, getExtensionSetting, getExtensionCommandId } from 'vscode-framework'
import { getLastModifiedDirs } from '../getLastModifiedDirs'
import { GithubRepo } from '../util'
import { getDirsFromCwd } from './git'
const icons = {
    github: '$(github-inverted)',
    nonGit: '$(file-directory)',
    nonRemote: '$(git-branch)',
}

// github-forked
// github-non-forked
type DirectoryType = 'github' | 'non-git' | 'non-remote'

/** Returns dirs, ready to show in quickPick */
// eslint-disable-next-line complexity
export const getDirectoriesToShow = async (cwd: string, selectedDirs: RequireAtLeastOne<Record<DirectoryType, boolean>>) => {
    const directories: Array<{ dirName: string; displayName: string }> = []
    // const githubDirectories: Array<Record<'owner' | 'name' | ''
    /** history holds repos slug */
    let history: string[] = []

    let { git: gitDirs, nonGit: nonGitDirs } = await getDirsFromCwd(cwd)

    if (getExtensionSetting('sortBy') === 'lastModified') {
        const newIndexes = {
            git: [] as string[],
            nonGit: [] as string[],
        }
        for (const dir of await getLastModifiedDirs(cwd)) {
            const gitDir = gitDirs.find(gitDir => gitDir === dir)
            if (gitDir) {
                newIndexes.git.push(gitDir)
                continue
            }

            const nonGitDir = nonGitDirs.find(nonGitDir => nonGitDir === dir)
            if (nonGitDir) {
                newIndexes.nonGit.push(nonGitDir)
                continue
            }
        }

        gitDirs = newIndexes.git
        nonGitDirs = newIndexes.nonGit
    }

    const ignoreRegexp = getExtensionSetting('ignore.dirNameRegex')
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
                const ownerCountMap = _.countBy(reposWithGithubInfo, r => r.owner)
                // TODO sort also by name
                reposWithGithubInfo = _.sortBy(reposWithGithubInfo, r => ownerCountMap[r.owner]).reverse()
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
                    type: 'github' as DirectoryType,
                    dirName: dirPath,
                    displayName: `${icons.github} ${owner}/${name}`,
                })),
            )
        }

        if (selectedDirs['non-remote']) {
            const reposWithoutRemote = dirsOriginInfo
                .map((info, index) => (info.status === 'fulfilled' && info.value === undefined ? gitDirs[index] : undefined))
                .filter(Boolean) as string[]
            return reposWithoutRemote.map(name => ({
                label: `${icons.nonRemote} ${name}`,
                value: name,
            }))
        }
    }

    if (selectedDirs['non-git'])
        directories.push(
            ...nonGitDirs.map(name => ({
                displayName: `${icons.nonGit} ${name}`,
                dirName: name,
            })),
        )

    if (getExtensionSetting('reverseList')) directories.reverse()

    return {
        cwd,
        directories,
        history,
    }
}
