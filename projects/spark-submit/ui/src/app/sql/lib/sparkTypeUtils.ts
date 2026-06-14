/**
 * Utilities for displaying Spark SQL type strings.
 *
 * Spark types like `struct<AssessmentId:string,EndedOn:string,...>` can be
 * extremely long.  These helpers abbreviate them for inline display and
 * pretty-format them for hover tooltips.
 */

/**
 * Find the index of the first comma at bracket-depth 0.
 * Returns -1 when none exists.
 */
function findTopLevelComma(s: string): number {
    let depth = 0
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '<') depth++
        else if (s[i] === '>') depth--
        else if (s[i] === ',' && depth === 0) return i
    }
    return -1
}

/**
 * Abbreviate a Spark SQL type string for compact display.
 *
 * Simple types are returned unchanged.  Complex types are shortened:
 *   struct<A:string,B:int,...>  →  struct
 *   array<struct<...>>          →  array<struct>
 *   array<string>               →  array<string>  (already short)
 *   map<string,struct<...>>     →  map<string,struct>
 */
export function abbreviateType(type: string): string {
    if (!type.includes('<')) return type

    const idx = type.indexOf('<')
    const typeName = type.substring(0, idx)
    const inner = type.substring(idx + 1, type.length - 1)

    switch (typeName) {
        case 'struct':
            return 'struct'
        case 'array':
            return `array<${abbreviateType(inner)}>`
        case 'map': {
            const comma = findTopLevelComma(inner)
            if (comma === -1) return type
            const key = inner.substring(0, comma)
            const val = inner.substring(comma + 1)
            return `map<${abbreviateType(key)},${abbreviateType(val)}>`
        }
        default:
            return type
    }
}

/** True when the type contains nested struct/array/map definitions. */
export function isComplexType(type: string): boolean {
    return type.includes('<')
}

/**
 * Pretty-format a Spark SQL type string with newlines and indentation.
 * Each struct field gets its own line; nested types are indented.
 */
export function prettyFormatType(type: string): string {
    const lines: string[] = []
    let indent = 0
    let i = 0
    let current = ''

    const flush = () => {
        const trimmed = current.trim()
        if (trimmed) lines.push('  '.repeat(indent) + trimmed)
        current = ''
    }

    while (i < type.length) {
        const ch = type[i]

        if (ch === '<') {
            current += '<'
            flush()
            indent++
            i++
        } else if (ch === '>') {
            flush()
            indent--
            lines.push('  '.repeat(indent) + '>')
            i++
        } else if (ch === ',') {
            current += ','
            flush()
            i++
        } else {
            current += ch
            i++
        }
    }

    flush()
    return lines.join('\n')
}
