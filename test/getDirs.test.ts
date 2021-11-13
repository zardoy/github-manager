/// <reference types="jest" />
import { join } from 'path'
import { Settings } from 'vscode-framework'
import * as vscodeFramework from 'vscode-framework/build/framework/settings'
import * as injectecVars from 'vscode-framework/build/framework/injected'
import * as getDirs from '../src/core/getDirs'

const getDirectoriesToShow = async (dirs: Parameters<typeof getDirs.getDirectoriesToShow>[1]) => {
    const { cwd, ...result } = await getDirs.getDirectoriesToShow(join(__dirname, './fixtures/mixed-dirs'), dirs)
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
    expect(await getDirectoriesToShow({ github: true })).toMatchInlineSnapshot(`
Object {
  "directories": Array [
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted) another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
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
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
    },
    Object {
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
  ],
  "history": Array [],
}
`)
    mockedSettings = { ...initialSettings }
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
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
    },
    Object {
      "dirName": "github-top",
      "displayName": "$(github-inverted) another-owner/a",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
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
        expected: result => expect(result).toMatchInlineSnapshot(),
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
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
    },
    Object {
      "description": "anotherGithubAuthor2",
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate",
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "description": "githubDuplicate2",
      "dirName": "githubDuplicate2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
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
    mockedSettings['ignore.dirNameRegex'] = '(non)|(github)'
    expect(await getDirectoriesToShow(ALL_DIRS_TYPES)).toMatchInlineSnapshot()
    resetSettings()
})

// 'another-author/some-forked-repo'
