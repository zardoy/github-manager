# GitHub Manager

- Highly configurable. A lot of sorting settings
- Syncable history of recently opened repos

![demo](https://github.com/zardoy/github-manager/blob/main/media/demo-main-command.png?raw=true)

There're two main type of commands: `show repos` and `show forked repos`. And two of variants for each: `cloned` and with remote repos (without `cloned` prefix). The latter one requires authentication, it uses `repo` scope, but only to read list of your private repos. However you can freely use this extension without any authentication (or even forcefully disable it via setting).

> Note about cloned repos: If you know that some of your repositories were renamed (or their ownership were changed) use [rename-repos](https://github.com/zardoy/rename-repos)'s *script*. It also means it won't display non-GitHub repos.

It's something like, [Project Manager extension](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager), but the latter is a more comprehensive extension for working with git dirs (tags, bookmarks and so on...)

- This extension uses `git.defaultCloneDirectory` underneath from which it gets cloned repos, it is sync-ignored by default.

![](https://raw.githubusercontent.com/microsoft/vscode-codicons/482a516fd42a0a0262725638300ba0fe0c106bbf/src/icons/dash.svg) means not forked repo.

> Note: if you have repos with the same origin, (perhaps you duplicated cloned directory repository), only first (random) one will be shown as yours and another one will be shown as yours. It's recommended to remove duplicated directories in these cases.

### TODO

- [ ] custom repository render template? (I don't really need it)
- [ ] allow other remoteName (defaults to origin) (From which origin extract repository url. This setting affects all commands.)

## Sorting

### Recently Opened

Recently opened items will appear on top for all commands. You can disable it by setting `githubManager.boostRecentlyOpened` to `false`

### For Cloned

For commands that have `cloned` in title, we apply sorting by count of respos of owner and then by name of repo.
In other words, repos of owner that have most repos will appear on top.

### For Remote

For commands that don't have `cloned` in title, we apply sorting according to `githubManager.onlineRepos.sortBy` setting.
For other cloned repos that we don't have access at GitHub.

## Open at GitHub

This is a command for opening current cloned repository at GitHub, in multi-root workspaces you have to select folder (cloned GitHub repo).

This command receives arguments: `path`, `originName` (defaults to `originName` setting)

### About the Icon

Initially I wanted to use GitHub icon with Project Manager icon background, however I presume I [can't use it](https://github.com/logos) in my "products".
So I picked [repo-push Octicon](https://github.com/primer/octicons/blob/main/icons/repo-push-24.svg)
