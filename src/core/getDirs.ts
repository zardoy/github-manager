/* eslint-disable zardoy-config/unicorn/prefer-regexp-test */
import path, { join } from 'path'
import fsExtra from 'fs-extra'
import { getGithubRemoteInfo } from 'github-remote-info'
import _ from 'lodash'
import { extensionCtx, getExtensionSetting, getExtensionSettingId, GracefulCommandError } from 'vscode-framework'
import ini from 'ini'
import isOnline from 'is-online'
import { fromUrl } from 'hosted-git-info'
import { Octokit } from '@octokit/rest'
import { getAllGithubRepos, getAuthorizedOctokit } from '../auth'
import { getDirsFromCwd, GithubRepo, RemoteGithubRepo } from './git'
import { findDuplicatesBy, normalizeRegex } from './util'

const icons = {
    github: '$(github-inverted)',
    nonGit: '$(file-directory)',
    nonRemote: '$(git-branch)',
}

// github-forked
// github-non-forked
export type DirectoryType = 'github' | 'non-git' | 'non-remote'
// TODO rename type
type DirectoryDisplayItem = {
    // remote don't have dirName
    dirName?: string
    displayName: string
    description?: string
    repoSlug?: string
}

const remoteName = 'origin'

/** Returns dirs, ready to show in quickPick */
// eslint-disable-next-line complexity
export const getDirectoriesToShow = async (
    cwd: string,
    selectedDirs: Partial<Record<DirectoryType, boolean>>,
    // if was invoked command that doesn't have "cloned" in title
    openWithRemotesCommand = false,
): Promise<{ cwd: string; directories: DirectoryDisplayItem[]; history: string[] }> => {
    const directories: DirectoryDisplayItem[] = []
    // const githubDirectories: Array<Record<'owner' | 'name' | ''
    /** history holds repos slug */
    let history: string[] = []

    let { git: gitDirs, nonGit: nonGitDirs } = await getDirsFromCwd(cwd)

    const ignoreRegexp = normalizeRegex(getExtensionSetting('ignore.dirNameRegex'))
    if (ignoreRegexp) {
        gitDirs = gitDirs.filter(dirName => !dirName.match(ignoreRegexp))
        nonGitDirs = nonGitDirs.filter(dirName => !dirName.match(ignoreRegexp))
    }

    if (selectedDirs.github || selectedDirs['non-remote']) {
        const dirsRemotesInfo = await Promise.allSettled(gitDirs.map(async dir => getDirRemotes(path.join(cwd, dir))))

        if (selectedDirs.github) {
            let forkDetectionMethod = getExtensionSetting('forkDetectionMethod')
            if (forkDetectionMethod === 'alwaysOnline') {
                if (!getExtensionSetting('enableAuthentication'))
                    throw new GracefulCommandError(
                        `${getExtensionSettingId('forkDetectionMethod')} with set to alwaysOnline requires ${getExtensionSettingId(
                            'enableAuthentication',
                        )} to be enabled`,
                    )
            } else if (forkDetectionMethod === 'fallback') {
                forkDetectionMethod = (await isOnline()) ? 'alwaysOnline' : 'upstreamRemote'
            }

            /** local repos */
            let reposWithGithubInfo = dirsRemotesInfo
                .map((state, index): GithubRepo | undefined => {
                    // TODO-low log failures
                    if (state.status === 'fulfilled' && state.value) {
                        const { value: remotes } = state
                        if (!remotes[remoteName]) return
                        const remoteParsed = fromUrl(remotes[remoteName])
                        if (!remoteParsed || remoteParsed.domain !== 'github') return undefined
                        return {
                            forked: forkDetectionMethod === 'upstreamRemote' ? 'upstream' in remotes : /* TODO online */ false,
                            dirName: gitDirs[index],
                            name: remoteParsed.project,
                            owner: remoteParsed.user,
                        }
                    }

                    return undefined
                })
                .filter(Boolean) as GithubRepo[]

            if (forkDetectionMethod === 'alwaysOnline' && !openWithRemotesCommand) {
                const allForks = (await getAllGithubRepos()).filter(({ fork }) => fork)
                reposWithGithubInfo = reposWithGithubInfo.map(repo => ({
                    ...repo,
                    forked: allForks.some(({ owner, name }) => owner.login === repo.owner && name === repo.name),
                }))
            }

            let topQuickPicks: RemoteGithubRepo[] = []
            if (openWithRemotesCommand)
                // TODO! only 100 is fetched
                /** remote + cloned that found on remote */
                topQuickPicks = (await getAllGithubRepos()).map(({ owner, name, fork: isFork }) => {
                    const clonedIndex = reposWithGithubInfo.findIndex(r => r.owner === owner.login && r.name === name)
                    const clonedRepo = reposWithGithubInfo[clonedIndex]
                    if (clonedRepo) reposWithGithubInfo.splice(clonedIndex, 1)
                    return { remote: true, dirName: clonedRepo && clonedRepo.dirName, forked: clonedRepo?.forked || isFork, owner: owner.login, name }
                })
            // displayName: `$(github-inverted) ${isCloned ? '' : '$(globe)'} ${full_name}`

            // desc
            const reposByOwner = Object.values(_.groupBy(reposWithGithubInfo, r => r.owner)).sort((a, b) => b.length - a.length)
            /** sorted by name of repo */
            const reposByOwnerSorted = reposByOwner.map(repos => _.sortBy(repos, r => r.name))
            reposWithGithubInfo = reposByOwnerSorted.flat(1)

            const allReposPicks = [...topQuickPicks, ...reposWithGithubInfo]
            if (getExtensionSetting('boostRecentlyOpened')) {
                history = extensionCtx.globalState.get('lastGithubRepos') ?? []
                for (const repoSlug of history) {
                    const [owner, name] = repoSlug.split('/')
                    const repoIndex = allReposPicks.findIndex(repo => repo.owner === owner && repo.name === name)
                    if (repoIndex === -1) continue
                    allReposPicks.unshift(allReposPicks[repoIndex])
                    allReposPicks.splice(repoIndex + 1, 1)
                }
            }

            const ignoreUsers = getExtensionSetting('ignore.users') as string[]
            reposWithGithubInfo = reposWithGithubInfo.filter(({ owner }) => !ignoreUsers.includes(owner))

            directories.push(
                ...allReposPicks.map(({ dirName, name, owner }) => ({
                    displayName: `${icons.github} ${owner}/${name}`,
                    dirName,
                    repoSlug: `${owner}/${name}`,
                    ...(getExtensionSetting('showFolderNames') === 'always' ? { description } : {}),
                })),
            )
        }

        if (selectedDirs['non-remote']) {
            const reposWithoutRemote = dirsRemotesInfo
                .map((info, index) => (info.status === 'fulfilled' && Object.keys(info.value).length === 0 ? gitDirs[index] : undefined))
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

const getDirRemotes = async (dirPath: string): Promise<{ [remote: string]: /* url */ string }> =>
    Object.fromEntries(
        Object.entries(ini.decode(await fsExtra.promises.readFile(join(dirPath, '.git/config'), 'utf-8')))
            .filter(([key]) => key.startsWith('remote'))
            .map(([key, value]) => [key.slice('remote "'.length, -1), value.url]),
    )
