import fs from 'fs'
import path from 'path'

// can we improve performance or is it good enough? (nah, it's not)
export const getDirsFromCwd = async (cwd: string) => {
    const dirs: Record<'git' | 'nonGit', string[]> = { git: [], nonGit: [] }
    const dirsList = await fs.promises.readdir(cwd)
    for (const dirName of dirsList) {
        if (!fs.lstatSync(path.join(cwd, dirName)).isDirectory()) continue

        const gitPath = path.join(cwd, dirName, '.git')
        const isGitDir = fs.existsSync(gitPath) && fs.lstatSync(gitPath).isDirectory()
        ;(isGitDir ? dirs.git : dirs.nonGit).push(dirName)
    }

    return dirs
}
