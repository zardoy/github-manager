import { modifyJsonFile } from 'modify-json-file';
import { commands } from '../src/commands/commands';
import path from 'path';
import gitRemoteOriginUrl from "git-remote-origin-url"

type ContributedCommand = Record<'category' | 'command' | 'title', string>;

(async () => {
    await modifyJsonFile(path.join(__dirname, '../package.json'), async json => {
        let githubRepoUrl = await gitRemoteOriginUrl();

        if (githubRepoUrl.endsWith(".git")) githubRepoUrl = githubRepoUrl.slice(0, -".git".length);
        json.repository = githubRepoUrl;
        
        const commandPrefix: string = json.name;
        const displayName: string = json.displayName;
        json.contributes.commands = commands.regular.map(({ command, title }) => {
            return {
                // category: category ? displayName : category,
                category: displayName,
                command: `${commandPrefix}.${command}`,
                title
            };
        });
        const allCommands = (json.contributes.commands as ContributedCommand[]).map(({ command }) => command);
        if (json.activationEvents[0] === 'onCommands' || json.activationEvents.every((event: string) => event.startsWith('onCommand:'))) {
            json.activationEvents = allCommands.map(command => `onCommand:${command}`);
        }

        json.engines = {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            vscode: `^${require('@types/vscode/package.json').version}`
        };

        return json;
    });
})();
