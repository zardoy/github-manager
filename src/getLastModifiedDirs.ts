import execa from 'execa'

export const getLastModifiedDirs = async (cwd: string): Promise<string[]> => {
    if (process.platform === 'win32') {
        const result = await execa('dir', ['/O-D'], { cwd })
        return result.stdout
            .split('\n')
            .map(str => /<DIR>\s+(.+)/.exec(str))
            .filter(Boolean)
            .map(match => match![1]!.trim())
    }

    const result = (await execa('ls', ['-t'], { cwd })).stdout
    return result.split('\n').map(str => str.trim())
}
