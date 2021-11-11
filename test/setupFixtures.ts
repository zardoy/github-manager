import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import fsExtra from 'fs-extra'
import { utimes } from 'utimes'
import delay from 'delay'
import { touchDirs } from './common'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fromFixtureDir = (...path: string[]) => join(__dirname, 'fixtures/mixed-dirs', ...path)

await fsExtra.emptyDir(fromFixtureDir())

type FromPath = (...path: string[]) => string

const createWithGitRemote =
    (remoteUrl: string, remote = 'origin') =>
    async (fromDir: FromPath) => {
        await fsExtra.ensureDir(fromDir('.git/'))
        await fsExtra.promises.writeFile(
            fromDir('.git/config'),
            `[remote "${remote}"]
        url=${remoteUrl}`,
        )
    }

const createGithubRepository = (repoSlag: string) => createWithGitRemote(`https://github.com/${repoSlag}.git`)

const dirs: Record<string, (fromPath: FromPath) => any> = {
    githubAuthor1: createGithubRepository('test-author/vscode-extension-name'),
    anotherGithubAuthor1: createGithubRepository('test-author/something-else'),
    githubAuthor2: createGithubRepository('another-owner/something-else'),
    anotherGithubAuthor2: createGithubRepository('another-owner/something-else-here'),
    githubDuplicate: createWithGitRemote('git+ssh://git@github.com/another-owner/something-else-here.git'),
    githubDuplicate2: createWithGitRemote('git+ssh://git@github.com/another-owner/something-else-here.git'),
    'github-top': createWithGitRemote('git+ssh://git@github.com/another-owner/a.git'),
    // Ignored! HAHA
    gitlabRepo: createWithGitRemote('https://gitlab.com/foo/bar/baz.git'),
    async nonRemote(fromDir) {
        await fsExtra.ensureFile(fromDir('.git/config'))
    },
    async nonGit() {},
}

for (const [dir, writeFunc] of Object.entries(dirs)) {
    const dirPath = fromFixtureDir(dir)
    await fsExtra.ensureDir(dirPath)
    await writeFunc((...path) => join(dirPath, ...path))
    await fsExtra.promises.writeFile(join(dirPath, 'test.txt'), 'Sample content')
}
