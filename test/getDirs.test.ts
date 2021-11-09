/// <reference types="jest" />
import { join } from 'path'
import { Settings } from 'vscode-framework'
import { getExtensionSetting } from 'vscode-framework/build/framework/settings'
import { getDirectoriesToShow as getDirectoriesToShowSource } from '../src/utils/getDirs'

const settingsExport = { getExtensionSetting }

const getDirectoriesToShow = async (dirs: Parameters<typeof getDirectoriesToShowSource>[1]) =>
    getDirectoriesToShowSource(join(__dirname, './fixtures/mixed-dirs'), dirs)

const mockedSettings: Settings = {
    'ignore.dirNameRegex': '',
    'ignore.users': [],
    sortBy: 'byOwner',
    reverseList: false,
    whereToOpen: 'newWindowIfNotEmpty',
}

beforeAll(() => {
    const getExtensionSettingSpy = jest.spyOn(settingsExport, 'getExtensionSetting')
    getExtensionSettingSpy.mockImplementation(setting => {
        console.log('called')
        return mockedSettings[setting]
    })
})

// mock extensionCtx only if sortBy is recentlyOpened

test('Get GitHub repos', async () => {
    expect(await getDirectoriesToShow({ github: true })).toMatchInlineSnapshot()
})

test('Get Non-Remote dirs', async () => {
    expect(await getDirectoriesToShow({ 'non-remote': true })).toMatchInlineSnapshot()
})

test('Get Non-Git dirs', async () => {
    expect(await getDirectoriesToShow({ 'non-git': true })).toMatchInlineSnapshot()
})
