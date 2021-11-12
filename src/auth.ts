import { Octokit } from '@octokit/rest'
import vscode from 'vscode'
import { GracefulCommandError } from 'vscode-framework'

export const initializeGithubAuth = async () => {
    vscode.authentication.onDidChangeSessions(e => {
        console.log('change', e)
    })
}

const signIn = async () => {
    const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true })
    return session?.accessToken
}

export async function getAuthorizedOctokit() {
    const token = await signIn()
    if (token) return new Octokit({ auth: token })

    throw new GracefulCommandError('You need to sign-in with GitHub to perform this operation', {
        actions: [
            {
                label: 'Sign In',
                async action() {
                    await signIn()
                    // TODO retry command
                },
            },
        ],
    })
}
