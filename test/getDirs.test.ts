/// <reference types="jest" />
import { join } from 'path'
import { Settings } from 'vscode-framework'
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js'
import * as vscodeFramework from 'vscode-framework/build/framework/settings'
import * as injectecVars from 'vscode-framework/build/framework/injected'
import * as getDirs from '../src/core/getDirs'
import * as auth from '../src/auth'

const getDirectoriesToShow = async (selectedDirs: getDirs.GetDirsParams['selectedDirs'], includeRemote = false) => {
    const dirsGenerator = getDirs.getDirectoriesToShow({
        cwd: join(__dirname, './fixtures/mixed-dirs'),
        abortSignal: new AbortController().signal,
        openWithRemotesCommand: includeRemote,
        selectedDirs,
    })
    const { history } = (await dirsGenerator.next()).value as getDirs.GetDirsYields<'history'>
    let lastDirectoriesResult: getDirs.GetDirsYields<'directories'> = undefined!
    for await (const dirs of dirsGenerator) lastDirectoriesResult = dirs as getDirs.GetDirsYields<'directories'>

    return { history, ...lastDirectoriesResult }
}

const ALL_DIRS_TYPES = { github: true, 'non-git': true, 'non-remote': true }

const initialSettings: Settings = {
    'ignore.dirNameRegex': '',
    'ignore.users': [],
    boostRecentlyOpened: false,
    whereToOpen: 'newWindowIfNotEmpty',
    showFolderNames: 'onDuplicates',
    enableAuthentication: false,
    'onlineRepos.clonedDirFormat': 'repoName',
    'onlineRepos.reposType': 'all',
    'onlineRepos.showArchived': false,
    'onlineRepos.orderBy': 'PUSHED_AT',
}
let mockedSettings: Settings = { ...initialSettings }
const resetSettings = () => {
    mockedSettings = { ...initialSettings }
}

// mock extensionCtx only if boostRecentlyOpened is true

beforeAll(() => {
    jest.spyOn(vscodeFramework, 'getExtensionSetting').mockImplementation(setting => mockedSettings[setting])
})

// TODO matrix with sortBy setting

test('Get GitHub repos', async () => {
    const result = await getDirectoriesToShow({ github: true })
    expect(result.directories).toContainEqual(
        expect.objectContaining({
            dirName: 'github-fork',
            repoSlug: 'awesome-contributor/vscode',
            description: expect.stringContaining('fork'), // has fork icon
        }),
    )
    expect(result).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted)$(folder) another-owner/a",
      "repoSlug": "another-owner/a",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
      "type": "local",
    },
    Object {
      "description": "$(folder) anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/something-else",
      "repoSlug": "test-author/something-else",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
      "type": "local",
    },
    Object {
      "description": "$(repo-forked) microsoft/vscode",
      "dirName": "github-fork",
      "displayName": "$(github-inverted)$(folder) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
      "type": "local",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted)$(folder) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
})

test('Use ignore settings', async () => {
    mockedSettings['ignore.users'] = ['test-author']
    mockedSettings['ignore.dirNameRegex'] = 'githubDuplicate'
    expect(await getDirectoriesToShow({ github: true })).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted)$(folder) another-owner/a",
      "repoSlug": "another-owner/a",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(repo-forked) microsoft/vscode",
      "dirName": "github-fork",
      "displayName": "$(github-inverted)$(folder) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
      "type": "local",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted)$(folder) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
    resetSettings()
})

test('Get Non-Remote dirs', async () => {
    expect(await getDirectoriesToShow({ 'non-remote': true })).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "nonRemote",
      "displayName": "$(git-branch) nonRemote",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
})

test('Get Non-Git dirs', async () => {
    expect(await getDirectoriesToShow({ 'non-git': true })).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "nonGit",
      "displayName": "$(file-directory) nonGit",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
})

test.each([
    {
        description: 'GitHub repos only',
        dirs: { github: true },
        expected: result =>
            expect(result).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
      "type": "local",
    },
    Object {
      "description": "$(folder) anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted)$(folder) another-owner/a",
      "repoSlug": "another-owner/a",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/something-else",
      "repoSlug": "test-author/something-else",
      "type": "local",
    },
    Object {
      "description": "$(repo-forked) microsoft/vscode",
      "dirName": "github-fork",
      "displayName": "$(github-inverted)$(folder) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
      "type": "local",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted)$(folder) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
      "type": "local",
    },
  ],
  "history": Array [
    "another-owner/something-else-here",
    "test-author/vscode-extension-name",
  ],
}
`),
    },
    {
        description: 'All dirs',
        dirs: ALL_DIRS_TYPES,
        expected: result =>
            expect(result).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
      "type": "local",
    },
    Object {
      "description": "$(folder) anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted)$(folder) another-owner/a",
      "repoSlug": "another-owner/a",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/something-else",
      "repoSlug": "test-author/something-else",
      "type": "local",
    },
    Object {
      "description": "$(repo-forked) microsoft/vscode",
      "dirName": "github-fork",
      "displayName": "$(github-inverted)$(folder) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
      "type": "local",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted)$(folder) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
      "type": "local",
    },
    Object {
      "dirName": "nonRemote",
      "displayName": "$(git-branch) nonRemote",
      "type": "local",
    },
    Object {
      "dirName": "nonGit",
      "displayName": "$(file-directory) nonGit",
      "type": "local",
    },
  ],
  "history": Array [
    "another-owner/something-else-here",
    "test-author/vscode-extension-name",
  ],
}
`),
    },
])(`Boosts recently opened with $description`, async ({ dirs, expected }) => {
    mockedSettings.boostRecentlyOpened = true
    // @ts-expect-error
    injectecVars.extensionCtx = {
        globalState: {
            get() {
                return ['another-owner/something-else-here', 'test-author/vscode-extension-name']
            },
        },
    }
    expected(await getDirectoriesToShow(dirs))
    resetSettings()
    // @ts-expect-error
    injectecVars.extensionCtx = undefined
})

// TOOD with ignore dirs
test('Get everything', async () => {
    expect(await getDirectoriesToShow(ALL_DIRS_TYPES)).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted)$(folder) another-owner/a",
      "repoSlug": "another-owner/a",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
      "type": "local",
    },
    Object {
      "description": "$(folder) anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/something-else",
      "repoSlug": "test-author/something-else",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
      "type": "local",
    },
    Object {
      "description": "$(repo-forked) microsoft/vscode",
      "dirName": "github-fork",
      "displayName": "$(github-inverted)$(folder) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
      "type": "local",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted)$(folder) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
      "type": "local",
    },
    Object {
      "dirName": "nonRemote",
      "displayName": "$(git-branch) nonRemote",
      "type": "local",
    },
    Object {
      "dirName": "nonGit",
      "displayName": "$(file-directory) nonGit",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
})

test('Get everything with ignore dirs setting', async () => {
    // thats right because regex are case-sensetive by default. To exclude all: /(non)|(github)/i
    mockedSettings['ignore.dirNameRegex'] = '(non)|(github)'
    expect(await getDirectoriesToShow(ALL_DIRS_TYPES)).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted)$(folder) test-author/something-else",
      "repoSlug": "test-author/something-else",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
    resetSettings()
})

describe('With remote', () => {
    const mockedRemoteRepos: auth.RepoResponse[] = [
        // suppose doesn't have "remote" branch on local
        {
            // suppose owner just renamed repo
            nameWithOwner: 'another-author/some-forked-repo',
            parent: {
                nameWithOwner: 'original-author/original-repo',
            },
            diskUsage: 0,
            isArchived: false,
        },
        // suppose another repo, from this user (test-author): something-else, was removed
        {
            nameWithOwner: 'test-author/vscode-extension-name',
            parent: null,
            diskUsage: 0,
            isArchived: false,
        },
        {
            nameWithOwner: 'test-author/something-that-isnt-cloned',
            parent: null,
            diskUsage: 0,
            isArchived: false,
        },
    ]

    const githubReposSpy = jest.spyOn(auth, 'getAllGithubRepos')
    githubReposSpy.mockImplementation(async function* () {
        yield mockedRemoteRepos
    })

    test('Shows remotes and cloned repos with correct order', async () => {
        expect(await getDirectoriesToShow(ALL_DIRS_TYPES, true)).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "description": "$(repo-forked) original-author/original-repo",
      "dirName": "github-without-upstream-remote",
      "diskUsage": 0,
      "displayName": "$(github-inverted)$(folder) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
      "type": "remote",
    },
    Object {
      "dirName": "githubAuthor1",
      "diskUsage": 0,
      "displayName": "$(github-inverted)$(folder) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
      "type": "remote",
    },
    Object {
      "dirName": undefined,
      "diskUsage": 0,
      "displayName": "$(github-inverted)$(globe) test-author/something-that-isnt-cloned",
      "repoSlug": "test-author/something-that-isnt-cloned",
      "type": "remote",
    },
    Object {
      "dirName": "github-top",
      "displayName": "$(github-alt)$(folder) another-owner/a",
      "repoSlug": "another-owner/a",
      "type": "local",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-alt)$(folder) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
      "type": "local",
    },
    Object {
      "description": "$(folder) anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-alt)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-alt)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "description": "$(folder) githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-alt)$(folder) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
      "type": "local",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-alt)$(folder) test-author/something-else",
      "repoSlug": "test-author/something-else",
      "type": "local",
    },
    Object {
      "description": "$(repo-forked) microsoft/vscode",
      "dirName": "github-fork",
      "displayName": "$(github-alt)$(folder) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
      "type": "local",
    },
    Object {
      "dirName": "nonRemote",
      "displayName": "$(git-branch) nonRemote",
      "type": "local",
    },
    Object {
      "dirName": "nonGit",
      "displayName": "$(file-directory) nonGit",
      "type": "local",
    },
  ],
  "history": undefined,
}
`)
    })
    test('Ignores user', async () => {
        mockedSettings['ignore.users'] = ['another-author']
        const { directories } = await getDirectoriesToShow(ALL_DIRS_TYPES, true)
        expect(directories).not.toContainEqual(
            expect.objectContaining({
                repoSlug: 'another-author',
            }),
        )
        resetSettings()
    })
})

// 'another-author/some-forked-repo'
