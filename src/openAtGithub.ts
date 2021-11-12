import path from 'path'
import { fromUrl } from 'hosted-git-info'
import urlJoin from 'url-join'
import { CommandHandler, getCurrentWorkspace, GracefulCommandError } from 'vscode-framework'
import ini from 'ini'
import vscode from 'vscode'

export const openAtGithub: CommandHandler = async (_, { path = '', remoteName = 'origin' }: { path?: string; remoteName?: string } = {}) => {
    const workspaceConfigMap = new Map<number, string>()
    const selectedWorkspace = await getCurrentWorkspace({
        async filterWorkspaces(workspace) {
            const { fs } = vscode.workspace
            const gitConfigPath = vscode.Uri.joinPath(workspace.uri, '.git/config')
            try {
                workspaceConfigMap.set(workspace.index, String(await fs.readFile(gitConfigPath)))
                return true
            } catch {
                return false
            }
        },
    })
    if (selectedWorkspace === undefined) return
    if (selectedWorkspace === false) {
        await vscode.window.showWarningMessage('There are no GitHub repositories in multi-root workspace')
        return
    }

    console.log(workspaceConfigMap, selectedWorkspace, vscode.workspace.workspaceFolders)
    const configString = workspaceConfigMap.get(selectedWorkspace.index)
    if (!configString) {
        await vscode.window.showWarningMessage('Not a GitHub repository')
        return
    }

    const remoteUrl = ini.decode(configString)[`remote "${remoteName}"`]?.url
    const remote = fromUrl(remoteUrl)
    if (!remote) throw new GracefulCommandError(`Bad remote ${remoteUrl}`)
    if (remote.domain !== 'github') {
        await vscode.window.showWarningMessage('Only GitHub repositories are supported')
        return
    }

    await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${urlJoin(remote.browse(), path)}`))
}
