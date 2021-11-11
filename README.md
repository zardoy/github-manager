# GitHub Manager

> Note: ensure that global VSCode setting `git.defaultCloneDirectory` points to the directory with your GitHub repos

Quickly switch between cloned GitHub repos. It's something like, [Project Manager extension](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager), but this extension aims to provide **only** GitHub projects with `owner/name` format with the main command **Show Cloned GitHub Repositories** (show-github-dirs). Here is how it look likes:

![demo](https://github.com/zardoy/github-manager/blob/main/media/demo-main-command.png?raw=true)

> Note: this command doesn't use GitHub API to get actual `owner/name` data, they're just extracted from the *origin* remote of each directory from `git.defaultCloneDirectory` path. If you know that some of your repositories were renamed (or their ownership were changed) use [rename-repos](https://github.com/zardoy/rename-repos)'s *script*. It also means it won't display non-GitHub repos.

I primarily needed this extension not only because I work only with GitHub repositories, but also because with this extension it is easily to see forks / travel between them. (forks view are coming soon)

Of course, Project Manager is a more comprehensive extension for working with git dirs (tags, bookmarks and so on...)

## How to Install

[Download VSIX](https://github.com/zardoy/github-manager/releases/latest/download/github-manager-0.0.1.vsix) and drop it to the VSCode.

## Additional Commands

<!-- TODO rephrase -->
> Note: All commands don't cache anything, so their lists would always be in sync with your directories.

### Show Non-Git Directories (show-non-git-dirs)

### Show Non-Remote Repositories (show-non-remote-repos)

Show git directories without *origin* remote. The most probably that aren't published yet.

## Developer Notes

If you need to edit commands list, edit them in `src/commands/commands.ts` and then run `update-package-json` NPM script.

These fields in `package.json` are generated automatically, do not edit them:

- `contributes.commands`
- `activationEvents` – do not edit `command` events

### TODO

- [ ] custom repository render template? (I don't really need it)
- [ ] allow other remoteName (defaults to origin) (From which origin extract repository url. This setting affects all commands.)

## Open at GitHub

This is a command for opening current cloned repository at GitHub, in multi-root workspaces you have to select folder (cloned GitHub repo).

This command receives arguments: `path`, `originName` (defaults to `originName` setting)

### About the Icon

Initially I wanted to use GitHub icon with Project Manager icon background, however I presume I [can't use it](https://github.com/logos) in my "products".
So I picked [repo-push Octicon](https://github.com/primer/octicons/blob/main/icons/repo-push-24.svg)
