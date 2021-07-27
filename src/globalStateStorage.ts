import vscode from 'vscode';

// TODO: vscode API doesn't work with no-floating-promises rule. investigate: https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/src/rules/no-floating-promises.ts

export class ExtensionGlobalStorage<T extends Record<string, any>> {
    constructor(
        private readonly extensionContext: Pick<vscode.ExtensionContext, 'globalState'>,
    ) {}

    get<K extends keyof T>(key: K): T[K] | undefined {
        return this.extensionContext.globalState.get(key as string);
    }

    set<K extends keyof T>(key: K, newValue: T[K]) {
        void this.extensionContext.globalState.update(key as string, newValue);
    }
}
