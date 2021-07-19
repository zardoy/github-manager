import vscode from 'vscode';
import { commands } from './commands';

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const commandPrefix = require('../../package.json').name;

export const registerCommand = (command: (typeof commands)['regular'][number]['command'], callback: () => Promise<void> | void) => {
    vscode.commands.registerCommand(`${commandPrefix}.${command}`, callback);
};
