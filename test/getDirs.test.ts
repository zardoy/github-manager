/// <reference types="jest" />
import { join } from 'path'
import * as vscodeFramework from 'vscode-framework/build/framework/settings'
import * as getDirs from '../src/utils/getDirs'

// const vscodeFramework2 = { getExtensionSetting }

const getDirectoriesToShow = async (dirs: Parameters<typeof getDirs.getDirectoriesToShow>[1]) =>
    getDirs.getDirectoriesToShow(join(__dirname, './fixtures/mixed-dirs'), dirs)

const mockedSettings = {
    'ignore.dirNameRegex': '',
    'ignore.users': [],
    sortBy: 'byOwner',
    reverseList: false,
    whereToOpen: 'newWindowIfNotEmpty',
}

// mock extensionCtx only if sortBy is recentlyOpened

test('Get GitHub repos', async () => {
    jest.spyOn(vscodeFramework, 'getExtensionSetting').mockImplementation(setting => {
        console.log('called')
        return mockedSettings[setting]
    })
    expect(await getDirectoriesToShow({ github: true })).toMatchInlineSnapshot(`
Object {
  "cwd": "/Users/vitaly/Documents/github-manager/test/fixtures/mixed-dirs",
  "directories": Array [
    Object {
      "dirName": "githubDuplicate",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "type": "github",
    },
    Object {
      "dirName": "githubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else",
      "type": "github",
    },
    Object {
      "dirName": "anotherGithubAuthor2",
      "displayName": "$(github-inverted) another-owner/something-else-here",
      "type": "github",
    },
    Object {
      "dirName": "githubAuthor1",
      "displayName": "$(github-inverted) test-author/vscode-extension-name",
      "type": "github",
    },
    Object {
      "dirName": "anotherGithubAuthor1",
      "displayName": "$(github-inverted) test-author/something-else",
      "type": "github",
    },
  ],
  "history": Array [],
}
`)
})

test('Get Non-Remote dirs', async () => {
    expect(await getDirectoriesToShow({ 'non-remote': true })).toMatchInlineSnapshot(`
Array [
  Object {
    "label": "$(git-branch) nonRemote",
    "value": "nonRemote",
  },
]
`)
})

test('Get Non-Git dirs', async () => {
    expect(await getDirectoriesToShow({ 'non-git': true })).toMatchInlineSnapshot(`
Object {
  "cwd": "/Users/vitaly/Documents/github-manager/test/fixtures/mixed-dirs",
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
