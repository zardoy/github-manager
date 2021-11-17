/* eslint-disable max-depth */
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
    /** repo size in kb */
    diskUsage: number
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
          /** kb */
          diskUsage: number
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

interface GetDirsYieldsIntersection {
    directories: DirectoryDisplayItem[]
    /** ignore if `undefined` */
    history: string[] | undefined
}
export type GetDirsYields<T extends keyof GetDirsYieldsIntersection> = Pick<GetDirsYieldsIntersection, T>

// TODO vscode fails to refactor it to destr
// TODO try to resolve complexity
/** Returns dirs, ready to show in quickPick */
// eslint-disable-next-line complexity
export async function* getDirectoriesToShow({
    cwd,
    selectedDirs,
    abortSignal,
    openWithRemotesCommand,
}: GetDirsParams): AsyncGenerator<GetDirsYields<'history'> | GetDirsYields<'directories'>> {
    let { git: gitDirs, nonGit: nonGitDirs } = await getDirsFromCwd(cwd)
    const bottomPicks: DirectoryDisplayItem[] = []

    if (selectedDirs['non-git'])
        bottomPicks.push(
            ...nonGitDirs.map(
                (name): DirectoryDisplayItem => ({
                    type: 'local',
                    displayName: `${ICONS.nonGit} ${name}`,
                    dirName: name,
                }),
            ),
        )

    /** history holds repos slug */
    const history: string[] | undefined = getExtensionSetting('boostRecentlyOpened') ? extensionCtx.globalState.get('lastGithubRepos') ?? [] : undefined
    yield { history }

    const ignoreRegexp = normalizeRegex(getExtensionSetting('ignore.dirNameRegex'))
    if (ignoreRegexp) {
        gitDirs = gitDirs.filter(dirName => !dirName.match(ignoreRegexp))
        nonGitDirs = nonGitDirs.filter(dirName => !dirName.match(ignoreRegexp))
    }

    if (selectedDirs.github || selectedDirs['non-remote']) {
        // TODO how to apply abortSignal here
        const dirsRemotesInfo = await Promise.allSettled(gitDirs.map(async dir => getDirRemotes(path.join(cwd, dir))))

        if (selectedDirs['non-remote']) {
            const reposWithoutRemote = dirsRemotesInfo
                .map((info, index) => (info.status === 'fulfilled' && Object.keys(info.value).length === 0 ? gitDirs[index] : undefined))
                .filter(Boolean) as string[]
            // have no idea what about performance here. However non-git dirs must be at bottom
            bottomPicks.unshift(
                ...reposWithoutRemote.map(
                    (name): DirectoryDisplayItem => ({
                        type: 'local',
                        displayName: `${ICONS.nonRemote} ${name}`,
                        dirName: name,
                    }),
                ),
            )
        }

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

            // sort cloned repos (ones that on remote will be reordered)
            // desc
            const reposByOwner = Object.values(_.groupBy(reposWithGithubInfo, r => getRepoFromSlug(r.slug).owner)).sort((a, b) => b.length - a.length)
            /** sorted also by name of repo */
            reposWithGithubInfo = reposByOwner.flatMap(repos => _.sortBy(repos, r => getRepoFromSlug(r.slug).name))

            const topQuickPicks: RemoteGithubRepo[] = []
            for await (const repos of openWithRemotesCommand ? getAllGithubRepos(abortSignal) : [[]]) {
                // TODO diskUsage
                topQuickPicks.push(
                    ...repos.map(({ nameWithOwner, parent, diskUsage }): typeof topQuickPicks[number] => {
                        const clonedIndex = reposWithGithubInfo.findIndex(r => r.slug === nameWithOwner)
                        const clonedRepo = reposWithGithubInfo[clonedIndex]
                        if (clonedRepo) reposWithGithubInfo.splice(clonedIndex, 1)
                        // eslint-disable-next-line zardoy-config/@typescript-eslint/prefer-optional-chain
                        return {
                            remote: clonedRepo === undefined,
                            dirName: clonedRepo?.dirName,
                            slug: nameWithOwner,
                            forkSlug: parent?.nameWithOwner,
                            diskUsage,
                        }
                    }),
                )
                /** remote + cloned that found on remote */
                let allReposPicks = [...topQuickPicks, ...reposWithGithubInfo]

                if (history)
                    for (const repoSlug of history) {
                        const repoIndex = allReposPicks.findIndex(({ slug }) => slug === repoSlug)
                        if (repoIndex === -1) continue
                        allReposPicks.unshift(allReposPicks[repoIndex])
                        allReposPicks.splice(repoIndex + 1, 1)
                    }

                const ignoreUsers = getExtensionSetting('ignore.users')
                if (ignoreUsers.length > 0) allReposPicks = allReposPicks.filter(({ slug }) => !ignoreUsers.includes(getRepoFromSlug(slug).owner))

                const allDirsPicks = [
                    ...allReposPicks.map(({ dirName, slug: repoSlug, forkSlug, ...rest }): DirectoryDisplayItem => {
                        const hasOnRemote = 'remote' in rest
                        const icon = `${openWithRemotesCommand && !hasOnRemote ? ICONS.githubNoAccess : ICONS.github}${
                            hasOnRemote && rest.remote ? ICONS.remote : ICONS.folder
                        }`
                        // maybe should return it back?
                        // ${forkSlug ? ICONS.fork : '$(dash)'}
                        let description = ''
                        if (forkSlug) description += `${ICONS.fork} ${forkSlug} `
                        if (getExtensionSetting('showFolderNames') === 'always' && dirName) description += `${ICONS.folder} ${dirName}`

                        return {
                            // TS?
                            type: hasOnRemote ? 'remote' : ('local' as any),
                            displayName: `${icon} ${repoSlug}`,
                            repoSlug,
                            dirName,
                            // get rid of empty descriptions in test snapshots
                            ...(description ? { description: description.trim() } : {}),
                            ...(('diskUsage' in rest ? { diskUsage: rest.diskUsage } : {}) as any),
                        }
                    }),
                    ...bottomPicks,
                ]

                if (getExtensionSetting('showFolderNames') === 'onDuplicates')
                    for (const [, indexes] of findDuplicatesBy(allDirsPicks, ({ repoSlug }) => repoSlug))
                        for (const i of indexes) {
                            const dir = allDirsPicks[i]
                            // TODO patch util fn
                            if (dir.repoSlug === undefined || !('dirName' in dir)) continue
                            if (!allDirsPicks[i].description) allDirsPicks[i].description = ''
                            allDirsPicks[i].description += `${ICONS.folder} ${dir.dirName}`
                        }

                // TODO yeldRepos
                yield { directories: allDirsPicks }
            }

            return
        }
    }

    yield { directories: bottomPicks }
}

const getDirRemotes = async (dirPath: string): Promise<{ [remote: string]: /* url */ string }> =>
    Object.fromEntries(
        Object.entries(ini.decode(await fsExtra.readFile(join(dirPath, '.git/config'), 'utf-8')))
            .filter(([key]) => key.startsWith('remote'))
            .map(([key, value]) => [key.slice('remote "'.length, -1), value.url]),
    )
