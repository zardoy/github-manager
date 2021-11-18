import { normalizeRegex } from '../src/core/util'

test('Empty', () => expect(normalizeRegex('')).toMatchInlineSnapshot(`""`))
test('Not regex', () => expect(normalizeRegex('abj/')).toMatchInlineSnapshot(`"abj/"`))
test('Regex', () => expect(normalizeRegex('/abj/')).toMatchInlineSnapshot(`/abj/`))
test('Regex with flags', () => expect(normalizeRegex('/abj/g')).toMatchInlineSnapshot(`/abj/g`))
