/// <reference types="jest" />
import { join } from 'path'
import { Settings } from 'vscode-framework'
import { AbortController } from 'abortcontroller-polyfill/dist/cjs-ponyfill.js'
import * as vscodeFramework from 'vscode-framework/build/framework/settings'
import * as injectecVars from 'vscode-framework/build/framework/injected'
import * as getDirs from '../src/core/getDirs'

const getDirectoriesToShow = async (selectedDirs: getDirs.GetDirsParams['selectedDirs'], includeRemote = false) => {
    const { ...result } = await getDirs.getDirectoriesToShow({
        cwd: join(__dirname, './fixtures/mixed-dirs'),
        abortSignal: new AbortController().signal,
        openWithRemotesCommand: includeRemote,
        selectedDirs,
    })
    return { ...result }
}

const ALL_DIRS_TYPES = { github: true, 'non-git': true, 'non-remote': true }

const initialSettings: Settings = {
    'ignore.dirNameRegex': '',
    'ignore.users': [],
    boostRecentlyOpened: false,
    whereToOpen: 'newWindowIfNotEmpty',
    showFolderNames: 'onDuplicates',
    enableAuthentication: false,
    // we don't test @octokit/rest?
    forkDetectionMethod: 'upstreamRemote',
    'onlineRepos.clonedDirFormat': 'repoName',
    'onlineRepos.reposType': 'all',
    'onlineRepos.showArchived': false,
    'onlineRepos.sortBy': 'lastPushed',
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
    expect(result.directories).toContainEqual<typeof result['directories'][number]>({
        dirName: 'github-fork',
        repoSlug: 'awesome-contributor/vscode',
        displayName: expect.stringContaining('fork'), // has fork icon
    })
    expect(result).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted) another-owner/a",
      "repoSlug": "another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
      "repoSlug": "test-author/something-else",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
    },
    Object {
      "dirName": "github-fork",
      "displayName": "$(github-inverted) $(repo-forked) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
    },
  ],
  "history": Array [],
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
      "displayName": "$(github-inverted) another-owner/a",
      "repoSlug": "another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
    },
    Object {
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "github-fork",
      "displayName": "$(github-inverted) $(repo-forked) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
    },
  ],
  "history": Array [],
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
    },
  ],
  "history": Array [],
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
    },
  ],
  "history": Array [],
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
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted) another-owner/a",
      "repoSlug": "another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
      "repoSlug": "test-author/something-else",
    },
    Object {
      "dirName": "github-fork",
      "displayName": "$(github-inverted) $(repo-forked) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
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
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted) another-owner/a",
      "repoSlug": "another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
      "repoSlug": "test-author/something-else",
    },
    Object {
      "dirName": "github-fork",
      "displayName": "$(github-inverted) $(repo-forked) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
    },
    Object {
      "dirName": "nonRemote",
      "displayName": "$(git-branch) nonRemote",
    },
    Object {
      "dirName": "nonGit",
      "displayName": "$(file-directory) nonGit",
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
      "displayName": "$(github-inverted) another-owner/a",
      "repoSlug": "another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
      "repoSlug": "another-owner/something-else",
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
      "repoSlug": "test-author/something-else",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
      "repoSlug": "test-author/vscode-extension-name",
    },
    Object {
      "dirName": "github-fork",
      "displayName": "$(github-inverted) $(repo-forked) awesome-contributor/vscode",
      "repoSlug": "awesome-contributor/vscode",
    },
    Object {
      "dirName": "github-without-upstream-remote",
      "displayName": "$(github-inverted) another-author/some-forked-repo",
      "repoSlug": "another-author/some-forked-repo",
    },
    Object {
      "dirName": "nonRemote",
      "displayName": "$(git-branch) nonRemote",
    },
    Object {
      "dirName": "nonGit",
      "displayName": "$(file-directory) nonGit",
    },
  ],
  "history": Array [],
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
      "displayName": "$(github-inverted) test-author/something-else",
      "repoSlug": "test-author/something-else",
    },
    Object {
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "repoSlug": "another-owner/something-else-here",
    },
  ],
  "history": Array [],
}
`)
    resetSettings()
})

// test.each([
//     {
//         description: 'Local only',
//     },
// ])('List only forks with $description')

// 'another-author/some-forked-repo'
