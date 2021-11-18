import GitHost, { fromUrl } from 'hosted-git-info'
import urlJoin from 'url-join'
import { CommandHandler, getCurrentWorkspace, GracefulCommandError } from 'vscode-framework'
import ini from 'ini'
import vscode from 'vscode'

export const openAtGithub: CommandHandler = async (_, { path = '', remoteName = 'origin' }: { path?: string; remoteName?: string } = {}) => {
    const workspaceRemoteMap = new Map<number, GitHost>() // workspace.index - remote url
    for (const workspace of vscode.workspace.workspaceFolders ?? []) {
        const gitConfigPath = vscode.Uri.joinPath(workspace.uri, '.git/config')
        try {
            const configString = String(await vscode.workspace.fs.readFile(gitConfigPath))
            const remoteUrl = ini.decode(configString)[`remote "${remoteName}"`]?.url
            const remote = fromUrl(remoteUrl)
            if (!remote) throw new GracefulCommandError(`Bad remote url for ${remoteName}: ${remoteUrl}`)
            if (remote.domain !== 'github.com') throw new GracefulCommandError('Only GitHub repositories are supported')
            workspaceRemoteMap.set(workspace.index, remote)
        } catch {}
    }

    const selectedWorkspace = await getCurrentWorkspace({
        filterWorkspaces(workspace) {
            return !!workspaceRemoteMap.get(workspace.index)
        },
        mapQuickPickItem(item) {
            const remote = workspaceRemoteMap.get(item.value.index)!
            return {
                ...item,
                description: `$(github-inverted) ${remote.user}/${remote.project}`,
            }
        },
    })
    if (selectedWorkspace === undefined) return
    if (selectedWorkspace === false) {
        await vscode.window.showWarningMessage('There are no GitHub repositories in multi-root workspace')
        return
    }

    const remoteUrl = workspaceRemoteMap.get(selectedWorkspace.index)!

    await vscode.env.openExternal(vscode.Uri.parse(urlJoin(remoteUrl.browse(), path)))
}
