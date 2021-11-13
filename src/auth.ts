import { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import vscode from 'vscode'
import { getExtensionSetting, GracefulCommandError } from 'vscode-framework'

export const initializeGithubAuth = async () => {
    if (!getExtensionSetting('enableAuthentication')) return
    await vscode.authentication.getSession('github', ['repo'])
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

export async function getAllGithubRepos() {
    const sortBy = getExtensionSetting('onlineRepos.sortBy')
    const showArchived = getExtensionSetting('onlineRepos.showArchived')

    const octokit = await getAuthorizedOctokit()
    let repos: RestEndpointMethodTypes['repos']['listForAuthenticatedUser']['response']['data'] = []
    for (let i = 1; true; i++) {
        // eslint-disable-next-line no-await-in-loop
        let { data: newRepos } = await octokit.repos.listForAuthenticatedUser({
            sort: sortBy === 'lastPushed' ? 'pushed' : sortBy === 'lastUpdated' ? 'updated' : sortBy === 'fullName' ? 'full_name' : sortBy,
            type: getExtensionSetting('onlineRepos.reposType'),
            per_page: 100,
            page: i,
        })
        if (!showArchived) newRepos = newRepos.filter(({ archived }) => !archived)
        repos = [...repos, ...newRepos]
        if (newRepos.length < 100) break
    }

    return repos
}
