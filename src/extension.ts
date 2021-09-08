/// <reference types="vscode-framework/build/client" />
import path from 'path';
import vscode, { QuickPickOptions } from 'vscode';
import { VscodeFramework, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework';
import { getGithubRemoteInfo } from 'github-remote-info';
import { SetRequired } from 'type-fest';
import { defaultsDeep } from 'lodash';
import { getGithubRepos, getReposDir, getWhereToOpen, openSelectedDirectory } from './util';
import { getDirsFromCwd } from './utils/git';

// TODO no-floating-promises doesn't work

export async function activate(ctx: vscode.ExtensionContext) {
    const framework = new VscodeFramework(ctx);

    framework.registerCommand('open-github-repos', async () => openNewDirectory({
        getDirectories: async () => {
            const repos = await getGithubRepos();

            const items: Array<VSCodeQuickPickItem<string>> = repos.map(({ owner, name, dirPath }) => ({
                label: `$(github-inverted) ${owner}/${name}`,
                value: dirPath,
            }));
            return items;
        },
        quickPickOptions: {
            placeHolder: 'Select repository to open',
        },
    }));
    // repo-forked
    framework.registerCommand('open-non-git-dirs', async () => openNewDirectory({
        async getDirectories() {
            const gitDefaultDir = getReposDir();

            const { nonGit: nonGitDirs } = await getDirsFromCwd(gitDefaultDir);
            const items: Array<VSCodeQuickPickItem<string>> = nonGitDirs.map(name => ({
                label: `$(file-directory) ${name}`,
                value: name,
            }));
            return items;
        },
        quickPickOptions: {
            placeHolder: 'Select non-git directory to open',
        },
    }));
    framework.registerCommand('open-non-remote-repos', async () => openNewDirectory({
        async getDirectories() {
            const gitDefaultDir = getReposDir();

            const { git: gitDirs } = await getDirsFromCwd(gitDefaultDir);
            const dirsOriginInfo = await Promise.allSettled(
                gitDirs.map(async dir => getGithubRemoteInfo(path.join(gitDefaultDir, dir))),
            );
            const reposWithoutRemote = dirsOriginInfo
                .map((info, index) =>
                    info.status === 'fulfilled' && info.value === undefined ? gitDirs[index] : undefined)
                .filter(Boolean) as string[];
            const items: Array<VSCodeQuickPickItem<string>> = reposWithoutRemote.map(name => ({
                label: `$(git-branch) ${name}`,
                value: name,
            }));
            return items;
        },
        quickPickOptions: {
            placeHolder: 'Select non-remote git directory to open',
        },
    }));
}

const askOpenInNewWindow = async () => showQuickPick([{ label: '$(activate-breakpoints) Open in new window', value: true }, { label: '$(circle-outline) Open in current window', value: false }]);

type MaybePromise<T> = T | Promise<T>;

interface Options {
    /** @returns with returnValue = relative path from default dir */
    getDirectories: () => MaybePromise<Array<VSCodeQuickPickItem<string>>>;
    quickPickOptions: SetRequired<QuickPickOptions, 'placeHolder'>;
}

const openNewDirectory = async ({ getDirectories, quickPickOptions }: Options) => {
    const whereToOpen = getWhereToOpen();
    let forceOpenNewWindow: undefined | boolean;

    if (whereToOpen === 'ask(before)') {
        const result = await askOpenInNewWindow();
        if (result === undefined) return;
        forceOpenNewWindow = result;
    }

    const items = await getDirectories();

    const dirName = await showQuickPick(items, defaultsDeep({
        matchOnDescription: true,
    }, quickPickOptions));
    if (!dirName) return;

    if (whereToOpen === 'ask(after)') {
        const result = await askOpenInNewWindow();
        if (result === undefined) return;
        forceOpenNewWindow = result;
    }

    console.log(forceOpenNewWindow);

    await openSelectedDirectory(dirName, forceOpenNewWindow);
};
