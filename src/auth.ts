import { graphql } from '@octokit/graphql'
import vscode from 'vscode'
import { getExtensionSetting, GracefulCommandError } from 'vscode-framework'

export const initializeGithubAuth = async () => {
    if (!getExtensionSetting('enableAuthentication')) return
    await vscode.authentication.getSession('github', ['repo'])
}

const signIn = async () => {
    try {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true })
        return session.accessToken
    } catch {
        throw new GracefulCommandError('You need to sign-in with GitHub to perform this operation')
    }
}

export async function getAuthorizedGraphqlOctokit() {
    const token = await signIn()
    return graphql.defaults({
        headers: {
            authorization: `token ${token}`,
        },
    })
}

interface RepoResponse {
    nameWithOwner: string
    /** kb */
    diskUsage: number
    isArchived: boolean
    parent: null | {
        nameWithOwner: string
    }
}

export async function* getAllGithubRepos(abortSignal: AbortSignal): AsyncGenerator<RepoResponse[]> {
    const orderBy = getExtensionSetting('onlineRepos.orderBy')
    const showArchived = getExtensionSetting('onlineRepos.showArchived')
    const reposType = getExtensionSetting('onlineRepos.reposType')

    const affiliations = reposType === 'owner' || reposType === 'collaborator' || reposType === 'organization_member' ? [reposType.toUpperCase()] : null
    const privacy = reposType === 'private' || reposType === 'public' ? reposType.toUpperCase() : null

    const graphql = await getAuthorizedGraphqlOctokit()
    let repos: RepoResponse[] = []
    let nextCursor: string | undefined
    for (let i = 1; true; i++) {
        console.time(`fetch page ${i}`)
        // eslint-disable-next-line no-await-in-loop
        const responseData = await graphql<any>(
            `
                query someRepos($orderByField: RepositoryOrderField!, $endCursor: String, $affiliations: [RepositoryAffiliation], $privacy: RepositoryPrivacy) {
                    viewer {
                        repositories(
                            first: 100
                            after: $endCursor
                            orderBy: { field: $orderByField, direction: DESC }
                            affiliations: $affiliations
                            privacy: $privacy
                        ) {
                            pageInfo {
                                endCursor
                                hasNextPage
                            }
                            nodes {
                                nameWithOwner
                                diskUsage
                                isArchived
                                parent {
                                    nameWithOwner
                                }
                            }
                        }
                    }
                }
            `,
            {
                orderByField: orderBy,
                endCursor: nextCursor,
                affiliations,
                privacy,
                request: {
                    signal: abortSignal,
                },
            },
        )
        let newRepos = responseData.viewer.repositories.nodes
        if (!showArchived) newRepos = newRepos.filter(({ isArchived }) => !isArchived)
        repos = [...repos, ...newRepos]
        console.timeEnd(`fetch page ${i}`)
        yield newRepos
        if (responseData.viewer.repositories.pageInfo.hasNextPage) nextCursor = responseData.viewer.repositories.pageInfo.endCursor
        else break
    }
}
