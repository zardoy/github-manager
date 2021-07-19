export const commands = {
    regular: [
        {
            command: 'show-github-repos',
            title: 'Show Cloned GitHub Repositories'
        },
        // {
        //     command: 'show-github-forked-repos',
        //     title: 'Show Forked Cloned GitHub Repositories'
        // },
        {
            command: 'show-non-git-dirs',
            title: 'Show Non-Git Directories'
        },
        {
            command: 'show-non-remote-repos',
            title: 'Show Non-Remote Repositories'
        }
        // {
        //     command: 'show-non-github-repos',
        //     title: 'Show Non-GitHub Repositories'
        // }
    ]
} as const;
