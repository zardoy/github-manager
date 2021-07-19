import fs from 'fs';
import path from 'path';
import remoteOrigin from 'git-remote-origin-url';
import { URL } from 'url';

// actually copy-pasted from zardoy/rename-repos/src/common.ts

// can we improve performance or is it good enough?
export const getDirsFromCwd = async (cwd: string) => {
    const dirs: Record<'git' | 'nonGit', string[]> = { git: [], nonGit: [] };
    const dirsList = await fs.promises.readdir(cwd);
    for (const dirName of dirsList) {
        if (!fs.lstatSync(path.join(cwd, dirName)).isDirectory()) {
            continue;
        }

        const gitPath = path.join(cwd, dirName, '.git');
        const isGitDir = fs.existsSync(gitPath) && fs.lstatSync(gitPath).isDirectory();
        (isGitDir ? dirs.git : dirs.nonGit).push(dirName);
    }

    return dirs;
};

export const getGithubRemoteInfo = async (repoRootPath: string): Promise<Record<'owner' | 'name', string> | undefined> => {
    let originUrl: undefined | string;
    try {
        try {
            originUrl = await remoteOrigin(repoRootPath);
        } catch (error) {
            if (error.message.startsWith('Couldn\'t find')) {
                originUrl = undefined;
            } else {
                throw error;
            }
        }

        if (!originUrl) {
            return undefined;
        }

        const gitMatch = /git@github.com:(?<owner>\w+)\/(?<name>.+)(.git)/.exec(originUrl);
        if (gitMatch) {
            return gitMatch.groups! as any;
        }

        const url = new URL(originUrl);
        if (url.hostname !== 'github.com') {
            throw new Error(`Unknown host ${url.hostname}`);
        }

        let [, owner, name] = url.pathname.split('/');
        if (name.endsWith('.git')) {
            name = name.slice(0, -'.git'.length);
        }

        return { owner, name };
    } catch (error) {
        throw new Error(`${error.message} Error occured in ${repoRootPath} with remote origin ${originUrl!}`);
    }
};
