import { showQuickPick } from 'vscode-framework'
import vscode from 'vscode'

test('Get GitHub repos', async () => {
    const promise = showQuickPick('test foo bar'.split(' ').map(label => ({ label, value: label })))
    await vscode.commands.executeCommand('list.focusDown')
    await vscode.commands.executeCommand('cursorDown')
    await promise
})
