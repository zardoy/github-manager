export const commands = {
    regular: [
        {
            command: 'open-github-repos',
            title: 'Open Cloned GitHub Repository',
        },
        // {
        //     command: 'open-github-forked-repos',
        //     title: 'Open Forked Cloned GitHub Repository'
        // },
        {
            command: 'open-non-git-dirs',
            title: 'Open Non-Git Directory',
        },
        {
            command: 'open-non-remote-repos',
            title: 'Open Non-Remote Repository',
        },
        // {
        //     command: 'open-non-github-repos',
        //     title: 'Open Non-GitHub Repository'
        // },
    ],
} as const;
