/**
 * JSONPath — string path parsing and object traversal.
 *
 * Parses `.prop`, `[index]`, `["quoted"]`, `['quoted']`
 * syntax and stores tokens as an array.
 * The asKey() method generates a unique string key for the path using null-byte delimiter (for map indexing).
 * The asPath() method converts the array back to a string.
 */
export class JSONPath extends Array<string | number | null> {
	// .data_$[3]['3']["3"].a["aa"].b['bb']
    static #reToken = /(\.(?<p>[A-Za-z_$][A-Za-z0-9_$]*|\*)|\[(?<st>\*)\]|\[(?<q1>(["']|))(?<n>\d+)\k<q1>\]|\[(?<q2>["'])(?<s>.*?)\k<q2>\])/gy;
    static #reUnescape = (s: string) => s.replace(/\\(.)/g, '$1');
    static #reIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
    static #escape = (s: unknown) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    /**
     * Constructor: parse string path with regex, or copy array tokens.
     *
     * For string:
     * - .prop → identifier token
     * - [3] → numeric token
     * - ['key'] / ["key"] → string token (unescape)
     * - Validation: position matching, bracket pairing
     */
    constructor(sPath?: string | Array<string | number | null>) {
		super();
        if (typeof sPath === 'string') {
			if (!sPath.length)
				throw new SyntaxError('JSONPath: path must not be empty');
            JSONPath.#reToken.lastIndex = 0;
            let m: RegExpExecArray | null;
            let i = 0;

            while ((m = JSONPath.#reToken.exec(sPath))) {
                if (m.index !== i) throw new SyntaxError(`JSONPath: invalid path segment at position ${i}`);
				// p: .abc; s: ['a']["a"], n: [3]['3']["3"]
                const { p, s, n, st } = (m.groups ?? {}) as { p?: string; s?: string; n?: string; st?: string };
                if (st || p === '*')
                    this.push(null);
                else if (p)
                    this.push(p);
                else if (s)
                    this.push(JSONPath.#reUnescape(s));
                else
                    this.push(parseInt(n as string, 10));
                i = JSONPath.#reToken.lastIndex;
            }
            if (i !== sPath.length) throw new SyntaxError(`JSONPath: invalid path segment at position ${i}`);
        } else if (Array.isArray(sPath))
			this.push(...sPath);
    }

	/**
	 * Factory: creates a JSONPath instance from JSONPath or string input.
	 * If already JSONPath, returns it as-is (no copy).
	 */
	static from(v: string | JSONPath | Array<string | number>) {
		return v instanceof JSONPath ? v : new JSONPath(v);
	}

    /**
     * A path-t egyedi string kulcská alakítja null-byte delimiterrel.
     * Használja a map-based watcher indexelésben.
     */
    asKey(): string {
        return Array.from(this, v => `${v ?? '*'}\0`).join('');
    }

    /**
     * Converts the token array back to string path format.
     * - number → [index]
     * - simple identifier → .prop
     * - special characters → ['quoted']
     */
    asPath(): string {
        return Array.from(this, v =>
            v === null ? '.*' :
            typeof v === 'number' ? `[${v}]` :
            JSONPath.#reIdent.test(v) ? `.${v}` :
            `['${JSONPath.#escape(v)}']`).join('');
    }

	/**
	 * Navigates along tokens on the target object/array.
	 * Returns undefined if any intermediate is undefined/null/non-object.
	 */
	selectFrom(target: Object): any {
		if (target === null || typeof target !== 'object')
			throw new TypeError('JSONPath.selectFrom: target must be an object or array');

		let current = target;
		for (const token of this) {
            if (token === null)
                throw new TypeError('JSONPath.selectFrom: path cannot contain wildcards');
			if (current === undefined || current === null || typeof current !== 'object')
				return undefined;
			current = current[token as keyof typeof current];
		}

		return current;
	}

    matches(aPath: JSONPath): boolean {
        if ((this.length > aPath.length) || (this.length < aPath.length && this.at(-1) !== null))
            // If not the same length, or the second 
            return false;
        for (let i = 0, il = this.length; i < il; i++) {
            const v = this[i];
            const ov = aPath[i];
            if (ov === null)
                throw new TypeError('JSONPath.matches: wildcards not allowed in compared path');    
            if (v !== null && ov !== v)
                return false;
        }
        return true;
    }

    /**
     * Wildcard-supported path traversal: at null (*) tokens,
     * collects all values of the current object/array, and if there
     * are further tokens, recurses through each child.
     *
     * Examples:
     * - '.a.*' → { a: { x: 1, y: 2 } } → [1, 2]
     * - '.a.*.name' → { a: [{ name: 'first' }, { name: 'second' }] } → ['first', 'second']
     * - '.*' → { a: 1, b: 2 } → [1, 2]
     *
     * Returns: array of all matched values (empty if none).
     */
    selectAllFrom(target: Object): any[] {
        if (target === null || typeof target !== 'object')
            throw new TypeError('JSONPath.selectAllFrom: target must be an object or array');

        let aInputs = [target];
        for (const token of this) {
            let aNewInputs: typeof aInputs = [];
            for (let current of aInputs) {
                if (current === undefined || current === null || typeof current !== 'object')
                    continue;
                if (token === null) { // Wildcard: összes érték felvétele
                    if (Array.isArray(current))
                        aNewInputs.push(...current);
                    else
                        aNewInputs.push(...Object.values(current));
                } else
                    aNewInputs.push(current[token as keyof typeof current]);
            }
            aInputs = aNewInputs;
        }
        return aInputs;
    }
}

/**
 * Reads a value from object/array by path.
 *
 * Path can be string or JSONPath. Returns undefined if any
 * intermediate level is missing or not object/array.
 */
export function getByPath(target: any, path: string | JSONPath): any {
    if (target === null || typeof target !== 'object')
        throw new TypeError('getByPath: target must be an object or array');
	if (typeof path !== 'string' && !(path instanceof JSONPath))
        throw new TypeError('getByPath: path must be a string or JSONPath');
	const oPath = JSONPath.from(path);
	return oPath.selectFrom(target);
}

/**
 * Writes a value into object/array by path.
 *
 * Automatically creates missing intermediate levels:
 * - numeric next token → []
 * - string next token → {}
 * 
 * Path must not be empty.
 * 
 * Autoconvert will aoutomatically convert the value to the target field's type.
 */
export function setByPath(target: any, path: string | JSONPath, value: any, autoConvert: boolean): any {
    if (target === null || typeof target !== 'object')
        throw new TypeError('setByPath: target must be an object or array');
    if (typeof path !== 'string' && !(path instanceof JSONPath))
        throw new TypeError('setByPath: path must be a string or JSONPath');

    const tokens = JSONPath.from(path);
    if (!tokens.length)
        throw new TypeError('setByPath: path must not be empty');

    let current: any = target;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const last = i === tokens.length - 1;
        if (last) {
            if (typeof value === 'function')
                current[token as keyof typeof current] = 
                    (value as (v: any) => any)(current[token as keyof typeof current]);
            else if (!autoConvert)
                current[token as keyof typeof current] = value;
            else {
                const prev = current[token as keyof typeof current];
                let v = value;
                if (typeof prev === 'number')
                    v = Number(value);
                else if (typeof prev === 'string')
                    v = String(value);
                else if (typeof prev === 'boolean')
                    v = Boolean(value);
                current[token as keyof typeof current] = v;
            }
            return target;
        }

        const nextToken = tokens[i + 1];
        let next = current[token as keyof typeof current];
        if (next === null || typeof next !== 'object') {
            next = typeof nextToken === 'number' ? [] : {};
            current[token as keyof typeof current] = next;
        }
        current = next;
    }

    return target;
}

/**
 * Diff operation types:
 * - 'val': value changed
 * - 'set': new property set
 * - 'rem': property removed
 * - 'ins': array insert
 * - 'del': array delete
 */
export type DiffKind = 'val' | 'set' | 'rem' | 'ins' | 'del';
/**
 * Diff entry: [path, type, key, value, removedValue?]
 *
 * - path: the modified location
 * - type: the operation type
 * - key: property name or array index
 * - value: the new value (array for ins/del)
 * - removedValue: the removed value (optional for del)
 */
export type DiffEntry = [
	path: JSONPath, 
	type: DiffKind, 
	key: string | number | undefined, 
	value: any, 
	removedValue?: any
];
/**
 * applyDiffs result: the modified target and inverseDiffs.
 * inverseDiffs reverses the modifications.
 */
export type ApplyDiffsResult = { target: any; inverseDiffs: DiffEntry[] };

/**
 * Computes deep difference between two objects/arrays.
 *
 * Returns a list of diffEntries that, when applied,
 * transform object 'a' into object 'b'.
 *
 * Algorithm:
 * - Primitives: 'val' diff
 * - Objects: key comparison (rem/set)
 * - Arrays: Longest Common Subsequence (LCS) based
 *   - prefix/suffix matching
 *   - middle section: ins/del operations
 *   - equalPairs memoization for recursion optimization
 * - Cycle detection: localVisited Set to detect circular references
 *
 * Function values inside the second parameter ('b') are treated as
 * computed values: they are invoked with the whole 'b' object and the
 * current path string, and the returned value is used for comparison.
 *
 * The typeOf helper distinguishes undefined from null
 * and array from object.
 */
export const diffDeep = (() => {
    const typeOf = (o: any): string => {
        if (o === undefined) return 'undefined';
        if (o === null) return 'null';
        if (Array.isArray(o)) return 'array';
        return typeof o;
    };

    return (a: any, b: any): DiffEntry[] => {
        const result: DiffEntry[] = [];
        const visited = new Set<any>();

        const extendPath = (path: JSONPath, key: string | number | undefined): JSONPath =>
            key === undefined ? path : new JSONPath([...path, key]);

        const diff = (
            parentPath: JSONPath,
            key: string | number | undefined,
            left: any,
            right: any,
            collector: DiffEntry[] = result,
            localVisited: Set<any> = visited,
        ): void => {
            if (left !== null && typeof left === 'object')
                localVisited.add(left);

            const path = extendPath(parentPath, key);
            if (typeof right === 'function') {
                right = right(b, path.asPath());
            }

            if (left === right)
                return;

            const leftType = typeof left;
            const rightType = typeof right;
            if (leftType !== rightType || typeOf(left) !== typeOf(right) || leftType !== 'object' || left === null || right === null) {
                collector.push([parentPath, 'val', key, right]);
                return;
            }

            if (Array.isArray(left)) {
                const equalPairs = new Map<string, boolean>();
                const pairKey = (iLeft: number, iRight: number) => `${iLeft}|${iRight}`;
                const arrayItemsEqual = (iLeft: number, iRight: number): boolean => {
                    const sPairKey = pairKey(iLeft, iRight);
                    if (equalPairs.has(sPairKey))
                        return equalPairs.get(sPairKey) as boolean;
                    if (left[iLeft] === right[iRight]) {
                        equalPairs.set(sPairKey, true);
                        return true;
                    }

                    const probe: DiffEntry[] = [];
                    diff(new JSONPath(), undefined, left[iLeft], right[iRight], probe, new Set());
                    const equal = probe.length === 0;
                    equalPairs.set(sPairKey, equal);
                    return equal;
                };

                const checkRange = (startLeft: number, startRight: number, count: number): void => {
                    for (let i = 0; i < count; i++) {
                        const iLeft = startLeft + i;
                        const iRight = startRight + i;
                        if (equalPairs.get(pairKey(iLeft, iRight)))
                            continue;
                        if (!localVisited.has(left[iLeft]))
                            diff(path, iLeft, left[iLeft], right[iRight], collector, localVisited);
                        else if (left[iLeft] !== right[iRight])
                            collector.push([path, 'val', iLeft, right[iRight]]);
                    }
                };

                const leftLength = left.length;
                const rightLength = right.length;
                if (leftLength === rightLength) {
                    checkRange(0, 0, leftLength);
                    return;
                }

                const minLength = Math.min(leftLength, rightLength);
                let prefix = 0;
                while (prefix < minLength && arrayItemsEqual(prefix, prefix))
                    prefix++;

                let suffix = 0;
                const leftEnd = leftLength - prefix;
                const rightEnd = rightLength - prefix;
                while (suffix < leftEnd && suffix < rightEnd && arrayItemsEqual(leftLength - 1 - suffix, rightLength - 1 - suffix))
                    suffix++;

                const leftEndMid = leftLength - suffix;
                const rightEndMid = rightLength - suffix;
                const leftMidLength = leftEndMid - prefix;
                const rightMidLength = rightEndMid - prefix;
                const commonMid = Math.min(leftMidLength, rightMidLength);

                if (prefix > 0) checkRange(0, 0, prefix);
                if (commonMid > 0) checkRange(prefix, prefix, commonMid);
                if (leftMidLength < rightMidLength)
                    collector.push([path, 'ins', prefix + commonMid, right.slice(prefix + commonMid, rightEndMid)]);
                else if (leftMidLength > rightMidLength)
                    collector.push([path, 'del', prefix + commonMid, leftMidLength - commonMid, left.slice(prefix + commonMid, leftEndMid)]);
                if (suffix > 0) checkRange(leftEndMid, rightEndMid, suffix);
                return;
            }

            const leftKeys = new Set(Object.keys(left));
            const rightKeys = new Set(Object.keys(right));
            for (const key of leftKeys)
                if (rightKeys.has(key) && !localVisited.has(left[key]))
                    diff(path, key, left[key], right[key], collector, localVisited);
            for (const key of leftKeys)
                if (!rightKeys.has(key))
                    collector.push([path, 'rem', key, undefined]);
            for (const key of rightKeys)
                if (!leftKeys.has(key))
                    collector.push([path, 'set', key, right[key]]);
        };

        diff(new JSONPath(), undefined, a, b);
        return result;
    };
})();

/**
 * Deep merge: recursively writes source object contents into target.
 *
 * - Objects merge recursively (key-to-key)
 * - Other types overwrite the target
 * - Arrays overwrite index-by-index (target length does not shrink)
 *
 * Target is modified and also returned.
 */
export const mergeDeep = (() => {
    const merge = (t: any, s: any): void => {
		for (const k of Object.keys(s)) {
			const tv = t[k], sv = s[k];
			if (tv && sv && typeof tv === 'object' && typeof sv === 'object')
				merge(tv, sv);
			else
				t[k] = sv;
		}
	};

    return (target: any, ...sources: any[]) => {
        if (target && typeof target === 'object')
            for (const s of sources)
                if (s && typeof s === 'object')
                    merge(target, s);
        return target;
    };
})();

/**
 * Deep merge that also removes excess elements from target.
 *
 * Difference from mergeDeep:
 * - Array lengths are set to match source
 * - Keys in target that are not in source are deleted
 */
export const forceDeep = (() => {
    const merge = (t: any, s: any): void => {
        for (const k of Object.keys(s)) {
            const tv = t[k];
            const sv = s[k];
            if ((typeof sv === 'object' && sv) && (typeof tv === 'object' && tv)) {
                merge(tv, sv);
                if (Array.isArray(sv) && Array.isArray(tv))
                    tv.length = sv.length;
            } else
                t[k] = sv;
        }
        for (const k of Object.keys(t))
            if (!Object.prototype.hasOwnProperty.call(s, k))
                delete t[k];
    };

    return (target: any, ...sources: any[]) => {
        if (target && typeof target === 'object')
            for (const s of sources)
                if (s && typeof s === 'object')
                    merge(target, s);
        return target;
    };
})();

/**
 * Recursively removes all empty objects and arrays.
 *
 * Returns: true if the object becomes empty after the operation.
 * Deletion proceeds backwards (longer indices first) so that
 * delete operations do not shift yet-to-be-processed indices.
 */
export function cleanDeep(o: any): boolean {
    if (o === null || typeof o !== 'object')
        return false;
    if (Array.isArray(o)) {
        for (let i = o.length - 1; i >= 0; i--)
            if (cleanDeep(o[i]))
                delete o[i];
        return o.length === 0;
    }
    const keys = Object.keys(o);
    for (let i = keys.length -1; i >= 0; i--) {
        const k = keys[i];
        if (cleanDeep(o[k]))
            delete o[k];
    }
    return Object.keys(o).length === 0;
}

/**
 * Renames keys at every level of an object/array tree.
 *
 * The fKeyMapper callback receives the [key, mappedValue] pair and can return:
 * - [newKey, newValue] → included in result
 * - null/undefined/false → element skipped
 */
export function mapDeep(source: any, fKeyMapper: (entry: [string, any]) => [string, any] | null | undefined | false): any {
    if (Array.isArray(source))
        return source.map(value => mapDeep(value, fKeyMapper));
    if (source !== null && typeof source === 'object') {
        const entries: [string, any][] = [];
        for (const [key, value] of Object.entries(source)) {
            const mapped = fKeyMapper([key, mapDeep(value, fKeyMapper)]);
            if (mapped)
                entries.push(mapped);
        }
        return Object.fromEntries(entries);
    }
    return source;
}

/**
 * Deep equality comparison between two objects/arrays.
 *
 * - Primitives: === comparison
 * - Objects: keys sorted, recursive equality
 * - Arrays: length + element-wise equality
 * - Cycle detection: osVisited Set to detect circular references
 *   (same object reference)
 */
export function equalDeep(a: any, b: any, osVisited = new Set<any>()): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== 'object') return false;

    osVisited.add(a);

    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++)
            if (osVisited.has(a[i])) {
                if (a[i] !== b[i])
                    return false;
            } else if (!equalDeep(a[i], b[i], osVisited)) return false;
        return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    const sortedA = keysA.sort();
    const sortedB = keysB.sort();
    for (let i = 0; i < sortedA.length; i++) {
        const keyA = sortedA[i];
        const keyB = sortedB[i];
        if (keyA !== keyB) return false;
        if (osVisited.has(a[keyA])) {
            if (a[keyA] !== b[keyB])
                return false;
        }
        if (!equalDeep(a[keyA], b[keyB], osVisited)) return false;
    }

    return true;
}

/**
 * Finds reference redundancies in an object/array tree.
 *
 * Detects structures containing the same object multiple times
 * (e.g., { a: shared, b: shared } where shared is an object).
 *
 * Algorithm:
 * - WeakMap: object → first occurrence path
 * - WeakSet: current traversal stack (cycle detection)
 * - DFS traversal, for each object:
 *   - if already seen → redundancy
 *   - if on stack → cycle (skip)
 *   - otherwise → mark as seen, traverse children
 */
export function findReferenceRedundancies(target: any): { firstPath: JSONPath; duplicatePath: JSONPath }[] {
    const result: { firstPath: JSONPath; duplicatePath: JSONPath }[] = [];
    if (target === null || typeof target !== 'object')
        return result;

    const seen = new WeakMap<object, JSONPath>();
    const stack = new WeakSet<object>();

    const crawler = (value: any, path: JSONPath): void => {
        if (value === null || typeof value !== 'object')
            return;
        if (stack.has(value))
            return;

        const firstPath = seen.get(value);
        if (firstPath) {
            result.push({ firstPath, duplicatePath: path });
            return;
        }

        seen.set(value, path);
        stack.add(value);
        if (Array.isArray(value))
            value.forEach((item, index) => crawler(item, new JSONPath([...path, index])));
        else
            Object.keys(value).forEach(key => crawler(value[key], new JSONPath([...path, key])));
        stack.delete(value);
    };

    crawler(target, new JSONPath());
    return result;
}

/**
 * Checks if the object/array contains redundant
 * object references. If so, throws TypeError.
 *
 * Usage: data validation in dasy constructor
 * to prevent infinite loops in diff.
 */
export function assertNoReferenceRedundancies(target: any, sLabel = 'data'): void {
    const redundancies = findReferenceRedundancies(target);
    if (!redundancies.length)
        return;

    const formatPath = (path: JSONPath) => path.asPath();
    const preview = redundancies.slice(0, 3)
        .map(({ firstPath, duplicatePath }) => `${formatPath(duplicatePath)} -> ${formatPath(firstPath)}`)
        .join(', ');
    const more = redundancies.length > 3 ? ` (+${redundancies.length - 3} more)` : '';
    throw new TypeError(`${sLabel} contains redundant object references: ${preview}${more}`);
}

/**
 * Applies diff entries to a target object/array.
 *
 * Applies diffs in sequence and collects inverseDiffs via unshift
 * (in reverse order so undo runs correctly).
 *
 * Operations:
 * - 'val' (key undefined): full target replacement
 * - 'val' (key defined): property value modification
 * - 'set': create new property / overwrite existing
 * - 'rem': delete property
 * - 'ins': array insert via splice
 * - 'del': array delete via splice
 *
 * inverseDiffs contains the original value for each operation
 * so it can be reversed.
 */
export function applyDiffs(target: any, aDiffs: DiffEntry[]): ApplyDiffsResult {
    const inverseDiffs: DiffEntry[] = [];

    for (const [path, type, key, value, removedValue] of aDiffs) {
        if (type === 'val' && key === undefined) {
            inverseDiffs.unshift([new JSONPath(), 'val', undefined, structuredClone(target)]);
            target = structuredClone(value);
            continue;
        }

        const parent = getByPath(target, path);
        if (parent === undefined)
            throw new TypeError(`applyDiffs: parent path not found: ${path.asPath()}`);

        if (type === 'val') {
            const prop = key as string | number;
            inverseDiffs.unshift([new JSONPath(path), 'val', prop, structuredClone(parent[prop])]);
            parent[prop] = structuredClone(value);
            continue;
        }
        if (type === 'set') {
            const prop = key as string | number;
            if (Object.prototype.hasOwnProperty.call(parent, prop))
                inverseDiffs.unshift([new JSONPath(path), 'val', prop, structuredClone(parent[prop])]);
            else
                inverseDiffs.unshift([new JSONPath(path), 'rem', prop, undefined]);
            parent[prop] = structuredClone(value);
            continue;
        }
        if (type === 'rem') {
            const prop = key as string | number;
            inverseDiffs.unshift([new JSONPath(path), 'set', prop, structuredClone(parent[prop])]);
            delete parent[prop];
            continue;
        }
        if (!Array.isArray(parent))
            throw new TypeError(`applyDiffs: ${type} requires array parent at ${path.asPath()}`);
        if (type === 'ins') {
            const index = key as number;
            inverseDiffs.unshift([new JSONPath(path), 'del', index, value.length, structuredClone(value)]);
            parent.splice(index, 0, ...structuredClone(value));
            continue;
        }
        if (type === 'del') {
            const index = key as number;
            const length = value as number;
            const removed = removedValue === undefined ? parent.slice(index, index + length) : removedValue;
            inverseDiffs.unshift([new JSONPath(path), 'ins', index, structuredClone(removed)]);
            parent.splice(index, length);
            continue;
        }

        throw new TypeError(`applyDiffs: unsupported diff type: ${type}`);
    }

    return { target, inverseDiffs };
}

/**
 * Deep clones diff entries: JSONPath objects and
 * value/removedValue fields via structuredClone.
 */
function cloneDiffs(aDiffs: DiffEntry[]): DiffEntry[] {
    return aDiffs.map(([path, type, key, value, removedValue]) => [
        new JSONPath(path),
        type,
        key,
        structuredClone(value),
        removedValue === undefined ? undefined : structuredClone(removedValue),
    ] as DiffEntry);
}

/**
 * JSONUndoBuffer — undo/redo buffer for objects/arrays.
 *
 * Records target state changes via diffs and can reverse or
 * reapply modifications using inverseDiffs.
 *
 * Operations:
 * - snapshot(): record new state (diff between previous snapshot vs current)
 * - undo(): revert (apply inverseDiffs)
 * - redo(): reapply (apply forward diffs)
 * - clear(): clear undo/redo stacks, update current snapshot
 *
 * snapshot() automatically detects if there is no change
 * and returns false (except when bForced=true).
 */
export class JSONUndoBuffer {
    #target: object | any[] | undefined = undefined;
    #snapshot: object | any[] | undefined = undefined;
    #undoStack: DiffEntry[][] = [];
    #redoStack: DiffEntry[][] = [];

    /**
     * Constructor: validates target and initializes
     * with snapshot (current state of target).
     */
    constructor(target: object | any[]) {
        if (target === null || typeof target !== 'object')
            throw new TypeError('JSONUndoBuffer: target must be an object or array');

        this.#target = target;
        this.clear();
    }

    /**
     * The monitored target object/array.
     */
    get target(): object | any[] {
        return this.#target as object | any[];
    }

    /**
     * Returns whether there is an undo step.
     */
    get canUndo(): boolean {
        return this.#undoStack.length !== 0;
    }

    /**
     * Returns whether there is a redo step.
     */
    get canRedo(): boolean {
        return this.#redoStack.length !== 0;
    }

    /**
     * The depth of the undo stack (number of steps that can still be undone).
     */
    get undoDepth(): number {
        return this.#undoStack.length;
    }

    /**
     * The depth of the redo stack (number of steps that can still be redone).
     */
    get redoDepth(): number {
        return this.#redoStack.length;
    }

    /**
     * Records a new snapshot.
     *
     * 1. Compute diff between target and snapshot.
     * 2. If no change and not forced → return false.
     * 3. Otherwise: push cloneDiffs'd diff onto undoStack,
     *    clear redoStack (new modification → redo invalid),
     *    update snapshot.
     *
     * Returns: true if new snapshot was created, false otherwise.
     */
    snapshot(bForced?: boolean): boolean {
        const undoDiffs = diffDeep(this.#target, this.#snapshot);
        if (!bForced && !undoDiffs.length)
            return false;

        this.#undoStack.push(cloneDiffs(undoDiffs));
        this.#redoStack.length = 0;
        this.#snapshot = structuredClone(this.#target);
        return true;
    }

    /**
     * Undo: revert to previous state.
     *
     * 1. Pop from undoStack.
     * 2. applyDiffs with cloneDiffs'd diff (gets inverseDiffs).
     * 3. target = modified target.
     * 4. inverseDiffs → redoStack (with cloneDiffs).
     * 5. snapshot = structuredClone(target).
     *
     * Returns: true if successful, false if undoStack is empty.
     */
    undo(): boolean {
        const undoDiffs = this.#undoStack.pop();
        if (!undoDiffs)
            return false;

        const { target, inverseDiffs } = applyDiffs(this.#target, cloneDiffs(undoDiffs));
        this.#target = target;
        this.#redoStack.push(cloneDiffs(inverseDiffs));
        this.#snapshot = structuredClone(this.#target);
        return true;
    }

    /**
     * Redo: reapply to next state.
     *
     * 1. Pop from redoStack.
     * 2. applyDiffs with cloneDiffs'd diff (gets inverseDiffs).
     * 3. target = modified target.
     * 4. inverseDiffs → undoStack (with cloneDiffs).
     * 5. snapshot = structuredClone(target).
     *
     * Returns: true if successful, false if redoStack is empty.
     */
    redo(): boolean {
        const redoDiffs = this.#redoStack.pop();
        if (!redoDiffs)
            return false;

        const { target, inverseDiffs } = applyDiffs(this.#target, cloneDiffs(redoDiffs));
        this.#target = target;
        this.#undoStack.push(cloneDiffs(inverseDiffs));
        this.#snapshot = structuredClone(this.#target);
        return true;
    }

    /**
     * Clears undo/redo stacks, updates snapshot with current target.
     */
    clear(): void {
        this.#undoStack.length = 0;
        this.#redoStack.length = 0;
        this.#snapshot = structuredClone(this.#target);
    }
}