import path from 'path';
import vscode from 'vscode';
import _ from 'lodash';
import { getDirsFromCwd, getGithubRemoteInfo } from './util';
import { CommandRegisterer } from '@zardoy/vscode-tools';
import { commands } from './commands';

// TODO @critical no-floating-promises doesn't work

interface Repo {
    owner: string;
    name: string;
    dirPath: string;
}

function getReposDir() {
    const gitDefaultDir: string | undefined | null = vscode.workspace.getConfiguration('git').get('defaultCloneDirectory');
    if (!gitDefaultDir) {
        throw new Error('Ensure that git.defaultCloneDirectory setting is pointing to directory with your GitHub repos');
    }

    return gitDefaultDir;
}

const getGithubRepos = async () => {
    const gitDefaultDir = getReposDir();

    const { git: gitDirs } = await getDirsFromCwd(gitDefaultDir);
    const dirsOriginInfo = await Promise.allSettled(
        gitDirs.map(async dir => getGithubRemoteInfo(path.join(gitDefaultDir, dir))),
    );
    const reposWithGithubInfo = dirsOriginInfo
        .map((state, index): Repo | undefined => {
            if (state.status === 'fulfilled') {
                return state.value ? { ...state.value, dirPath: path.join(gitDefaultDir, gitDirs[index]) } : undefined;
            }

            return undefined;
        })
        .filter(Boolean) as Repo[];
    const ownerCountMap = _.countBy(reposWithGithubInfo, r => r.owner);
    // TODO sort also by name
    const sortedRepos = _.sortBy(reposWithGithubInfo, r => ownerCountMap[r.owner]).reverse();

    return sortedRepos;
};

export async function activate(ctx) {
    const outputChannel = vscode.window.createOutputChannel("TESTING")
    console.log = (...args) => outputChannel.appendLine(JSON.stringify(args));
    
    const commandRegisterer = new CommandRegisterer(commands, ctx);
    
    commandRegisterer.registerCommand('open-github-repos', async () => {
        console.time("Show selections")
        const repos = await getGithubRepos();

        const items: vscode.QuickPickItem[] = repos.map(({ owner, name }) => ({
            label: `$(github-inverted) ${owner}/${name}`,
        }));

        console.timeEnd("Show selections")
        const selection = await vscode.window.showQuickPick<vscode.QuickPickItem>(items, {
            placeHolder: 'Select repository to select',
            matchOnDescription: true,
        });
        if (!selection) {
            return;
        }

        const selectionIndex = items.indexOf(selection);
        const folderUri = vscode.Uri.file(repos[selectionIndex].dirPath);
        await vscode.commands.executeCommand('vscode.openFolder', folderUri);
    });
    // repo-forked
    commandRegisterer.registerCommand('open-non-git-dirs', async () => {
        const gitDefaultDir = getReposDir();

        const { nonGit: nonGitDirs } = await getDirsFromCwd(gitDefaultDir);
        const items: vscode.QuickPickItem[] = nonGitDirs.map(name => ({
            label: `$(file-directory) ${name}`,
        }));

        const selection = await vscode.window.showQuickPick<vscode.QuickPickItem>(items, {
            placeHolder: 'Select non-git directory to open',
            matchOnDescription: true,
        });
        if (!selection) {
            return;
        }

        const selectionIndex = items.indexOf(selection);
        const folderUri = vscode.Uri.file(path.join(gitDefaultDir, nonGitDirs[selectionIndex]));
        await vscode.commands.executeCommand('vscode.openFolder', folderUri);
    });
    commandRegisterer.registerCommand('open-non-remote-repos', async () => {
        const gitDefaultDir = getReposDir();

        const { git: gitDirs } = await getDirsFromCwd(gitDefaultDir);
        const dirsOriginInfo = await Promise.allSettled(
            gitDirs.map(async dir => getGithubRemoteInfo(path.join(gitDefaultDir, dir))),
        );
        const reposWithoutRemote = dirsOriginInfo
            .map((info, index) =>
                info.status === 'fulfilled' && info.value === undefined ? gitDirs[index] : undefined)
            .filter(Boolean) as string[];
        const items: vscode.QuickPickItem[] = reposWithoutRemote.map(name => ({
            label: `$(git-branch) ${name}`,
        }));
        const selection = await vscode.window.showQuickPick<vscode.QuickPickItem>(items, {
            placeHolder: 'Select non-remote git directory to open',
            matchOnDescription: true,
        });
        if (!selection) {
            return;
        }

        const selectionIndex = items.indexOf(selection);
        const folderUri = vscode.Uri.file(path.join(gitDefaultDir, reposWithoutRemote[selectionIndex]));
        await vscode.commands.executeCommand('vscode.openFolder', folderUri);
    });
}
