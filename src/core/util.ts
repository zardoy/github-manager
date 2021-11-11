type GetValueArrCallback<T, K> = (value: T, index: number) => K

// lodash-marker
export const findDuplicatesBy = <T, K>(arr: T[], getValue: GetValueArrCallback<T, K>): Array<[K, [number, number, ...number[]]]> => {
    const valuesIndexes = new Map<K, number[]>()

    let i = 0
    for (const arrValue of arr) {
        const value = getValue(arrValue, i)
        if (!valuesIndexes.has(value)) valuesIndexes.set(value, [])
        valuesIndexes.get(value)!.push(i)
        i++
    }

    return [...valuesIndexes].filter(([, indexes]) => indexes.length > 1) as Array<[K, [number, number, ...number[]]]>
}

export const normalizeRegex = (input: string) => {
    const regexMatch = /^\/.+\/(.*)$/.exec(input)
    if (!regexMatch) return input
    const pattern = input.slice(1, -regexMatch[1].length - 1)
    const flags = regexMatch[1]
    return new RegExp(pattern, flags)
}
