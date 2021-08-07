import { updatePackageJson } from '@zardoy/vscode-tools/cli';
import { commands } from '../src/commands';

updatePackageJson({
    commands,
    where: 'original',
}).catch(() => process.exit(1));
