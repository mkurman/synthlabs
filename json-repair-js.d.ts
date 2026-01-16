declare module 'json-repair-js' {
    /**
     * Repair a malformed JSON string.
     * @param json The malformed JSON string to repair
     * @returns The repaired JSON string
     */
    export function jsonrepair(json: string): string;
}
