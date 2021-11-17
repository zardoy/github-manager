/* eslint-disable zardoy-config/unicorn/prefer-regexp-test */
import path, { join } from 'path'
import fsExtra from 'fs-extra'
import { fromUrl } from 'hosted-git-info'
import ini from 'ini'
import isOnline from 'is-online'
import _ from 'lodash'
import { extensionCtx, getExtensionSetting, getExtensionSettingId, GracefulCommandError } from 'vscode-framework'
import { getAllGithubRepos } from '../auth'
import { getDirsFromCwd } from './git'
import { findDuplicatesBy, normalizeRegex } from './util'

const ICONS = {
    github: '$(github-inverted)',
    nonGit: '$(file-directory)',
    nonRemote: '$(git-branch)',

    githubNoAccess: '$(github-alt)',
}

export interface GithubRepo {
    owner: string
    name: string
    forked: boolean
    /** Relative directory path from defaultCloneDirectory */
    dirName: string
}

export interface RemoteGithubRepo {
    remote: boolean
    owner: string
    name: string
    forked: boolean
    dirName?: string
}

export type DirectoryType = 'github' | 'non-git' | 'non-remote'
export type DirectoryDisplayItem = {
    displayName: string
    description?: string
} & (
    | {
          type: 'local'
          /** Only if is repository */
          repoSlug?: string
          dirName: string
      }
    | {
          type: 'remote'
          repoSlug: string
      }
)

const defaultRemoteName = 'origin'

export interface GetDirsParams {
    cwd: string
    selectedDirs: Partial<Record<DirectoryType, boolean>>
    // if was invoked command that doesn't have "cloned" in title. Only for repos
    abortSignal: AbortSignal
    openWithRemotesCommand: boolean
}

// TODO vscode fails to refactor it to destr
// TODO try to resolve complexity
/** Returns dirs, ready to show in quickPick */
// eslint-disable-next-line complexity
export const getDirectoriesToShow = async ({
    cwd,
    selectedDirs,
    abortSignal,
    openWithRemotesCommand,
}: GetDirsParams): Promise<{ directories: DirectoryDisplayItem[]; history: string[] }> => {
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
        // TODO how to apply abortSignal here
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
                        if (!remotes[defaultRemoteName]) return
                        const remoteParsed = fromUrl(remotes[defaultRemoteName])
                        if (!remoteParsed || remoteParsed.domain !== 'github.com') return undefined
                        return {
                            forked: forkDetectionMethod === 'upstreamRemote' ? 'upstream' in remotes : false,
                            dirName: gitDirs[index],
                            name: remoteParsed.project,
                            owner: remoteParsed.user,
                        }
                    }

                    return undefined
                })
                .filter(Boolean) as GithubRepo[]

            if (forkDetectionMethod === 'alwaysOnline' && !openWithRemotesCommand) {
                // Some remotes might not have remote branch (for some reason).
                // Get user's forks from online and mark as forks
                // But only if user chooses to open cloned repos
                // Remote have their forks detection method
                const allForks = (await getAllGithubRepos(abortSignal)).filter(({ fork }) => fork)
                reposWithGithubInfo = reposWithGithubInfo.map(repo => ({
                    ...repo,
                    forked: allForks.some(({ owner, name }) => owner.login === repo.owner && name === repo.name),
                }))
            }

            let topQuickPicks: RemoteGithubRepo[] = []
            if (openWithRemotesCommand)
                /** remote + cloned that found on remote */
                topQuickPicks = (await getAllGithubRepos(abortSignal)).map(({ owner, name, fork: isFork }) => {
                    const clonedIndex = reposWithGithubInfo.findIndex(r => r.owner === owner.login && r.name === name)
                    const clonedRepo = reposWithGithubInfo[clonedIndex]
                    if (clonedRepo) reposWithGithubInfo.splice(clonedIndex, 1)
                    // eslint-disable-next-line zardoy-config/@typescript-eslint/prefer-optional-chain
                    return {
                        remote: clonedRepo === undefined,
                        dirName: clonedRepo && clonedRepo.dirName,
                        forked: clonedRepo?.forked || isFork,
                        owner: owner.login,
                        name,
                    }
                })

            // sort cloned repos that don't have on remote
            // desc
            const reposByOwner = Object.values(_.groupBy(reposWithGithubInfo, r => r.owner)).sort((a, b) => b.length - a.length)
            /** sorted by name of repo */
            const reposByOwnerSorted = reposByOwner.map(repos => _.sortBy(repos, r => r.name))
            reposWithGithubInfo = reposByOwnerSorted.flat(1)

            let allReposPicks = [...topQuickPicks, ...reposWithGithubInfo]
            const ignoreUsers = getExtensionSetting('ignore.users')
            allReposPicks = allReposPicks.filter(({ owner }) => !ignoreUsers.includes(owner))

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

            directories.push(
                ...allReposPicks.map(({ dirName, forked: isFork, name, owner, ...rest }): DirectoryDisplayItem => {
                    const icon = `${openWithRemotesCommand && !('remote' in rest) ? ICONS.githubNoAccess : ICONS.github}${
                        'remote' in rest && rest.remote ? '$(globe)' : '$(folder)'
                    }${isFork ? '$(repo-forked)' : '$(dash)'}`
                    return {
                        // TS?
                        type: 'remote' in rest ? 'remote' : ('local' as any),
                        displayName: `${icon} ${owner}/${name}`,
                        repoSlug: `${owner}/${name}`,
                        ...(getExtensionSetting('showFolderNames') === 'always' && dirName ? { description: `$(folder) ${dirName}` } : {}),
                        ...('remote' in rest ? { dirName } : {}),
                    }
                }),
            )
        }

        if (selectedDirs['non-remote']) {
            const reposWithoutRemote = dirsRemotesInfo
                .map((info, index) => (info.status === 'fulfilled' && Object.keys(info.value).length === 0 ? gitDirs[index] : undefined))
                .filter(Boolean) as string[]
            directories.push(
                ...reposWithoutRemote.map(
                    (name): DirectoryDisplayItem => ({
                        type: 'local',
                        displayName: `${ICONS.nonRemote} ${name}`,
                        dirName: name,
                    }),
                ),
            )
        }
    }

    if (selectedDirs['non-git'])
        directories.push(
            ...nonGitDirs.map(
                (name): DirectoryDisplayItem => ({
                    type: 'local',
                    displayName: `${ICONS.nonGit} ${name}`,
                    dirName: name,
                }),
            ),
        )

    // The same items can be only on repositores
    if (getExtensionSetting('showFolderNames') === 'onDuplicates')
        for (const [, indexes] of findDuplicatesBy(directories, ({ repoSlug }) => repoSlug))
            for (const i of indexes) {
                const dir = directories[i]
                console.log('match', dir)
                // TODO patch util fn
                if (dir.repoSlug === undefined || !('dirName' in dir)) continue
                if (!directories[i].description) directories[i].description = ''
                directories[i].description += `$(folder) ${dir.dirName}`
            }

    return {
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

// const getRepoInfoFromSlug = (repoSlug: string) => {
//     const [owner, name] = repoSlug.split('/')
//     return { owner, name }
// }
