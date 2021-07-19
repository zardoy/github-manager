# GitHub Manager

> Note: ensure that global VSCode setting `git.defaultCloneDirectory` points to the directory with your GitHub repos

Quickly switch between cloned GitHub repos. It's something like, [Project Manager extension](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager), but this extension aims to provide **only** GitHub projects with `owner/name` format with the main command **Show Cloned GitHub Repositories** (show-github-dirs). Just compare:

[PASTE GIF]

> Note: this command doesn't use GitHub API to get actual `owner/name` data, they're just extracted from the *origin* remote. If you know that some of your repositories were renamed (or their ownership were changed) use [rename-repos](https://github.com/zardoy/rename-repos)'s *script*. It also means it won't display non-GitHub repos.

I primarily needed this extension not only because I work only with GitHub repositories, but also because with this extension it is easily to see forks / travel between them. (forks view are coming soon)

Of course, Project Manager is a more comprehensive extension for working with git dirs (tags, bookmarks and so on...)

## Bonus Commands

<!-- TODO rephrase -->
> Note: All commands don't cache anything, so their lists would always be in sync with your directories. If you feel that some of the commands are slow, open an issue.

### Show Non-Git Directories (show-non-git-dirs)

### Show Non-Remote Repositories (show-non-remote-repos)

Show git directories without *origin* remote. The most probably that aren't published yet.

## Developer Notes

If you need to edit commands list, edit them in `src/commands/commands.ts` and then run `update-package-json` NPM script.

These fields in `package.json` are generated automatically, do not edit them:

- `contributes.commands`
- `activationEvents` – do not edit `command` events
