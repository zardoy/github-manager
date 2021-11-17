/* eslint-disable zardoy-config/unicorn/prefer-regexp-test */
import path, { join } from 'path'
import fsExtra from 'fs-extra'
import ini from 'ini'
import _ from 'lodash'
import { extensionCtx, getExtensionSetting } from 'vscode-framework'
import { getAllGithubRepos } from '../auth'
import { getDirsFromCwd, getRepoFromSlug, getRepoSlug, parseGithubRemoteUrl } from './git'
import { findDuplicatesBy, normalizeRegex } from './util'

const ICONS = {
    github: '$(github-inverted)',
    nonGit: '$(file-directory)',
    nonRemote: '$(git-branch)',

    githubNoAccess: '$(github-alt)',
    remote: '$(globe)',
    fork: '$(repo-forked)',
    folder: '$(folder)',
}

interface GithubRepoBase {
    slug: string
    forkSlug?: string
}

export interface GithubRepoLocal extends GithubRepoBase {
    /** Relative directory path from defaultCloneDirectory */
    dirName: string
}

export interface RemoteGithubRepo extends GithubRepoBase {
    remote: boolean
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
            /** local repos */
            let reposWithGithubInfo = dirsRemotesInfo
                .map((state, index): GithubRepoLocal | undefined => {
                    // TODO-low log failures
                    if (state.status === 'fulfilled' && state.value) {
                        const { value: remotes } = state
                        if (!remotes[defaultRemoteName]) return
                        const remoteParsed = parseGithubRemoteUrl(remotes[defaultRemoteName])
                        if (!remoteParsed) return undefined
                        const forkOwnerName = 'upstream' in remotes ? parseGithubRemoteUrl(remotes.upstream) : undefined
                        return {
                            forkSlug: forkOwnerName && getRepoSlug(forkOwnerName),
                            dirName: gitDirs[index],
                            slug: getRepoSlug(remoteParsed),
                        }
                    }

                    return undefined
                })
                .filter(Boolean) as GithubRepoLocal[]

            let topQuickPicks: RemoteGithubRepo[] = []
            if (openWithRemotesCommand)
                /** remote + cloned that found on remote */
                topQuickPicks = (await getAllGithubRepos(abortSignal)).map(({ nameWithOwner, diskUsage, parent }) => {
                    const clonedIndex = reposWithGithubInfo.findIndex(r => r.slug === nameWithOwner)
                    const clonedRepo = reposWithGithubInfo[clonedIndex]
                    if (clonedRepo) reposWithGithubInfo.splice(clonedIndex, 1)
                    // eslint-disable-next-line zardoy-config/@typescript-eslint/prefer-optional-chain
                    return {
                        remote: clonedRepo === undefined,
                        dirName: clonedRepo?.dirName,
                        slug: nameWithOwner,
                        forkSlug: parent?.nameWithOwner,
                    }
                })

            // sort cloned repos that don't have on remote
            // desc
            const reposByOwner = Object.values(_.groupBy(reposWithGithubInfo, r => getRepoFromSlug(r.slug).owner)).sort((a, b) => b.length - a.length)
            /** sorted by name of repo */
            const reposByOwnerSorted = reposByOwner.map(repos => _.sortBy(repos, r => getRepoFromSlug(r.slug).name))
            reposWithGithubInfo = reposByOwnerSorted.flat(1)

            let allReposPicks = [...topQuickPicks, ...reposWithGithubInfo]
            const ignoreUsers = getExtensionSetting('ignore.users')
            if (ignoreUsers.length > 0) allReposPicks = allReposPicks.filter(({ slug }) => !ignoreUsers.includes(getRepoFromSlug(slug).owner))

            if (getExtensionSetting('boostRecentlyOpened')) {
                history = extensionCtx.globalState.get('lastGithubRepos') ?? []
                for (const repoSlug of history) {
                    const repoIndex = allReposPicks.findIndex(({ slug }) => slug === repoSlug)
                    if (repoIndex === -1) continue
                    allReposPicks.unshift(allReposPicks[repoIndex])
                    allReposPicks.splice(repoIndex + 1, 1)
                }
            }

            directories.push(
                ...allReposPicks.map(({ dirName, slug: repoSlug, forkSlug, ...rest }): DirectoryDisplayItem => {
                    const icon = `${openWithRemotesCommand && !('remote' in rest) ? ICONS.githubNoAccess : ICONS.github}${
                        'remote' in rest && rest.remote ? ICONS.remote : ICONS.folder
                    }`
                    // maybe should return it back?
                    // ${forkSlug ? ICONS.fork : '$(dash)'}
                    let description = ''
                    if (forkSlug) description += `${ICONS.fork} ${forkSlug} `
                    if (getExtensionSetting('showFolderNames') === 'always' && dirName) description += `${ICONS.folder} ${dirName}`

                    return {
                        // TS?
                        type: 'remote' in rest ? 'remote' : ('local' as any),
                        displayName: `${icon} ${repoSlug}`,
                        repoSlug,
                        // get rid of empty descriptions in test snapshots
                        ...(description ? { description } : {}),
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
                directories[i].description += `${ICONS.folder} ${dir.dirName}`
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
