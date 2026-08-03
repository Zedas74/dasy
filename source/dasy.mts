import { applyDiffs, diffDeep, JSONPath, getByPath, setByPath, assertNoReferenceRedundancies, type DiffEntry, JSONUndoBuffer } from './json_tools.mjs';
import { html, svg, type HTMLAttributeValue } from './html.mjs';

type DasyPathArgument = string | JSONPath | undefined;
type DasyDiffKind = DiffEntry[1];
type DasyDiffEntry = DiffEntry;
type DasyWatcherKind = 'for' | 'with';

type DasyRenderContext = {
    currentWatcher?: DasyWatcher;
}

type DasyTemplateResult = Node | HTMLAttributeValue | null | undefined | boolean | readonly DasyTemplateResult[];
type DasyTemplateContext = {
    for(path: DasyPathArgument | DasyTemplateFunction, template?: DasyTemplateFunction, emptyTemplate?: DasyTemplateFunction): (parent: Element) => DocumentFragment;
    with(path: DasyPathArgument, template: DasyTemplateFunction): (parent: Element | Attr) => DasyTemplateResult;
    set(path: DasyPathArgument | unknown, value?: unknown): void;
    refresh(): void;
}
type DasyTemplateFunction = (
    data: unknown,
    root: DasyTemplateContext,
    parent: Element | Attr,
    path: string,
    renderParent?: DasyTemplateContext,
    ownerParent?: DasyTemplateContext,
) => DasyTemplateResult;

type DasyWatcherParams = {
    dasy: Dasy;
    path: JSONPath;
    parent: Element | Attr;
    attributeOwner?: Element;
    template: DasyTemplateFunction;
    ownerParent?: DasyWatcher;
    renderParent?: DasyWatcher;
    kind?: DasyWatcherKind;
    children?: DasyWatcher[];
    emptyTemplate?: DasyTemplateFunction;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Watcher
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * This is a data binding observer.
 * Holds the path, the parent DOM element/attr, the template function,
 * and the inner watcher tree structure (for/with directives).
 */
class DasyWatcher {
    dasy: Dasy | undefined = undefined; // Parent dasy instance
    path: JSONPath | undefined = undefined; // Path of the watched data in the dasy's JSON
    parent: Element | Attr | undefined = undefined; // Parent DOM element
    attributeOwner: Element | undefined = undefined; // Original owner element for attribute watchers
    startNode: Text | undefined = undefined; // DOM bookmark in parent before the template's own value
    endNode: Text | undefined = undefined; // DOM bookmark in parent after the template's own value
    template: DasyTemplateFunction | undefined = undefined; // Template function which produce the dasy
    ownerParent: DasyWatcher | undefined = undefined; // Watcher that owns this watcher's lifecycle
    renderParent: DasyWatcher | undefined = undefined; // Watcher whose template API is exposed as renderParent
    templateAPI: DasyTemplateContext | undefined = undefined; // Functions which are available in the template function
    kind: DasyWatcherKind = 'with';
    children: DasyWatcher[] | undefined = undefined; // Owned watcher subtree
    emptyTemplate: DasyTemplateFunction | undefined = undefined; // Template rendered when a 'for' array is empty

    constructor(oParams: DasyWatcherParams) {
        Object.assign(this, oParams);
        if (!this.attributeOwner && this.parent instanceof Attr)
            this.attributeOwner = this.parent.ownerElement ?? undefined;
        const templateAPI: DasyTemplateContext = {
            for: (path, template, emptyTemplate) => (parent: Element) => this.renderFor(path, template, emptyTemplate, parent),
            with: (path, template) => (parent: Element | Attr) => this.renderWith(path, template, parent),
            set: this.set,
            refresh: this.refresh,
        };
        this.templateAPI = Object.freeze(templateAPI);
    }

    /**
     * Creates another watcher within the same Dasy instance.
     * This keeps watcher construction consistent across for/with/rebuild paths.
     */
    createWatcher(oParams: Omit<DasyWatcherParams, 'dasy'>): DasyWatcher {
        return new DasyWatcher({ dasy: this.dasy as Dasy, ...oParams });
    }

    /**
     * Registers a child watcher both in the owner tree and in the path index.
     */
    registerChild(oWatcher: DasyWatcher): DasyWatcher {
        (this.children ??= []).push(oWatcher);
        (this.dasy as Dasy).addWatcher(oWatcher);
        return oWatcher;
    }

    /**
     * If parent is Attr, calls renderAttribute, otherwise
     * calls renderTemplate with wrapFragment (startNode/endNode sentinels).
     */
    render(data: unknown, renderContext: DasyRenderContext): DocumentFragment | HTMLAttributeValue {
        if (this.parent instanceof Attr)
            return this.renderAttribute(data, renderContext);
        const dasy = this.dasy as Dasy;
        const template = this.template as DasyTemplateFunction;
        const parent = this.parent as Element;
        return this.wrapFragment(dasy.renderTemplate(template, data, this, parent, renderContext, this.renderParent, this.ownerParent));
    }

    /**
     * For attribute binding: renders the template with the value.
     */
    renderAttribute(data: unknown, renderContext: DasyRenderContext): HTMLAttributeValue {
        const dasy = this.dasy as Dasy;
        const template = this.template as DasyTemplateFunction;
        const parent = this.parent as Attr;
        return dasy.renderTemplateValue(template, data, this, parent, renderContext, this.renderParent, this.ownerParent);
    }

    /**
     * Creates sentinel text nodes (startNode, endNode) for
     * clearing and re-rendering content based on diff.
     */
    wrapFragment(oContentFragment: Node): DocumentFragment {
        this.startNode = document.createTextNode('');
        this.endNode = document.createTextNode('');
        const fragment = document.createDocumentFragment();
        fragment.append(this.startNode, oContentFragment, this.endNode);
        return fragment;
    }

    /**
     * Removes DOM nodes between startNode and endNode
     * (the previous dynamic content) before re-rendering.
     */
    clearContentDOMNodes(): void {
        let current = this.startNode?.nextSibling;
        while (current && current !== this.endNode) {
            const next = current.nextSibling;
            current.remove();
            current = next;
        }
    }

    /**
     * Resolves a relative path based on the watcher's own base path.
     * If JSONPath or empty string/undefined, returns the base path.
     * Otherwise appends the given path to the base path.
     */
    resolvePath(path: DasyPathArgument = ''): JSONPath {
        const basePath = this.path as JSONPath;
        if (path instanceof JSONPath)
            return path.length ? new JSONPath([...basePath, ...path]) : new JSONPath(basePath);
        if (path === '' || path === undefined)
            return new JSONPath(basePath);
        return new JSONPath([...basePath, ...new JSONPath(path)]);
    }

    /**
     * Renders the `for` directive:
     * 1. Resolves the full path, fetches the data (must be an array).
     * 2. Creates a baseWatcher and a wrapped fragment.
     * 3. For each array item, creates a new watcher, renders it,
     *    and inserts it into the fragment between startNode/endNode sentinels.
     * 4. Registers the baseWatcher and inner watchers in the dasy.
     */
    renderFor(path: DasyPathArgument | DasyTemplateFunction, template: DasyTemplateFunction | undefined, emptyTemplate: DasyTemplateFunction | undefined, parent: Element): DocumentFragment {
        const dasy = this.dasy as Dasy;
        const renderContext = dasy.activeRenderContext;
        if (!(parent instanceof Element))
            throw new TypeError('"for" must be used inside an element parent');
        if (!renderContext)
            throw new TypeError('Render context missing for "for"');
        if (template === undefined && typeof path === 'function') { template = path; path = ''; }
        const fullPath = this.resolvePath(typeof path === 'function' ? '' : path);
        const data = getByPath(dasy.data, fullPath);
        if (!Array.isArray(data)) throw new TypeError('"for" only usable for arrays');
        const renderParent = renderContext.currentWatcher ?? this;
        const baseWatcher = this.createWatcher({
            path: fullPath,
            parent,
            template: template as DasyTemplateFunction,
            kind: 'for',
            ownerParent: renderParent,
            renderParent,
            emptyTemplate,
        });
        const allItems = baseWatcher.wrapFragment(document.createDocumentFragment());
        data.forEach((value, index) => {
            const newWatcher = baseWatcher.createWatcher({
                path: new JSONPath([...fullPath, index]),
                parent,
                template: template as DasyTemplateFunction,
                ownerParent: baseWatcher,
                renderParent,
            });
            const fragment = newWatcher.render(value, renderContext);
            baseWatcher.registerChild(newWatcher);
            allItems.insertBefore(fragment as Node, baseWatcher.endNode as Text);
        });
        if (data.length === 0 && emptyTemplate) {
            const emptyWatcher = baseWatcher.createWatcher({
                path: fullPath,
                parent,
                template: emptyTemplate,
                ownerParent: baseWatcher,
                renderParent,
            });
            const fragment = emptyWatcher.render(data, renderContext);
            baseWatcher.registerChild(emptyWatcher);
            allItems.insertBefore(fragment as Node, baseWatcher.endNode as Text);
        }
        renderParent.registerChild(baseWatcher);
        return allItems;
    }

    /**
     * Renders the `with` directive:
     * 1. Resolves the full path, fetches the data (must be an object, not array).
     * 2. Creates a new watcher with the full path.
     * 3. Renders the template with the data, and registers the watcher.
     */
    renderWith(path: DasyPathArgument, template: DasyTemplateFunction, parent: Element | Attr): DasyTemplateResult {
        const dasy = this.dasy as Dasy;
        const renderContext = dasy.activeRenderContext;
        const attributeBinding = parent instanceof Attr;
        if (!attributeBinding && !(parent instanceof Element))
            throw new TypeError('"with" must be used inside an element parent');
        if (!renderContext)
            throw new TypeError('Render context missing for "with"');
        const fullPath = this.resolvePath(path);
        const data = getByPath(dasy.data, fullPath);
        if (data === null || typeof data !== 'object' || Array.isArray(data))
            throw new TypeError('"with" only usable for objects');
        const renderParent = renderContext.currentWatcher ?? this;
        const newWatcher = this.createWatcher({ path: fullPath, parent, template, ownerParent: renderParent, renderParent });
        const result = newWatcher.render(data, renderContext);
        renderParent.registerChild(newWatcher);
        return result;
    }

    /**
     * Sets a value in the data model at the given path.
     * If value is undefined, then value=path, path=''.
     * If value is Event, uses target.value.
     * Then triggers the dasy refresh.
     */
    set = (path: DasyPathArgument | unknown, value?: unknown): void => {
        if (value === undefined) { value = path; path = ''; }
        if (value instanceof Event) {
            const source = value.target as HTMLInputElement | HTMLSelectElement;
            if (!source.validity.valid)
                return;
            value = source.value;
        }
        const dasy = this.dasy as Dasy;
        // Autoconvert value type to the target field
        setByPath(dasy.data as any, this.resolvePath(path as DasyPathArgument), value, true);
        dasy.refresh();
    };

    /**
     * Calls the dasy instance refresh method.
     */
    refresh = (): void => {
        (this.dasy as Dasy).refresh();
    };

    /**
     * Removes all owned child watchers via dasy removeWatcher.
     */
    clearChildren(): void {
        while (this.children?.length)
            (this.dasy as Dasy).removeWatcher(this.children[this.children.length - 1], this);
    }

    /**
     * Full cleanup: removes DOM nodes, clears owned child watchers,
     * sets all properties to undefined.
     */
    disconnect(): void {
        this.clearContentDOMNodes();
        this.startNode?.remove(); this.startNode = undefined;
        this.endNode?.remove(); this.endNode = undefined;
        this.clearChildren();
        this.dasy = undefined; this.path = undefined; this.parent = undefined; this.template = undefined; 
        this.ownerParent = undefined; this.renderParent = undefined;
        this.attributeOwner = undefined;
        this.templateAPI = undefined;
    }
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Dasy
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

type DasyRootParams = {
    data: object; // JSON object for the dasy's data source
    container: HTMLElement; // DOM container of the dasy DOM output
    beforeRefresh?: (data: object) => void; // called before each refresh pass
    afterRefresh?: (data: object) => void; // called after each refresh pass
}

/**
 * Dasy — the main rendering class.
 *
 * Responsibilities:
 * 1. Data model management (#data) and backup (#backup) storage.
 * 2. DOM tree rendering from template based on data.
 * 3. Watcher indexing by path (#map) for diff-based
 *    updates.
 * 4. Diff generation between backup and data, and efficient
 *    DOM tree synchronization with changes.
 */
class Dasy {
    #rootWatcher: DasyWatcher | undefined;
    #map: Map<string, Set<DasyWatcher>> | undefined = new Map();
    #data: object | undefined; // Dasy's JSON data source
    #backup: object | undefined; // Copy of the JSON data
    #container: HTMLElement | undefined; // Parent DOM element
    #activeRenderContext: DasyRenderContext | undefined;
    #beforeRefresh: ((data: object) => void) | undefined;
    #afterRefresh: ((data: object) => void) | undefined;
    static #createRenderContext = (): DasyRenderContext => ({ currentWatcher: undefined });

    /**
     * The render context is owned by Dasy instead of being copied
     * onto every watcher instance. Template callbacks query it only
     * while a render is actively executing.
     */
    get activeRenderContext(): DasyRenderContext | undefined {
        return this.#activeRenderContext;
    }

    #withRenderContext<T>(renderContext: DasyRenderContext, callback: () => T): T {
        const previousContext = this.#activeRenderContext;
        this.#activeRenderContext = renderContext;
        try {
            return callback();
        } finally {
            this.#activeRenderContext = previousContext;
        }
    }

    #invokeTemplate(template: DasyTemplateFunction, data: unknown, oWatcher: DasyWatcher, parent: Element | Attr, renderContext: DasyRenderContext, oRenderParent?: DasyWatcher, oOwnerParent?: DasyWatcher): unknown {
        return this.#withRenderContext(renderContext, () => {
            const previousWatcher = renderContext.currentWatcher;
            renderContext.currentWatcher = oWatcher;
            try {
                const value = template(data, oWatcher.templateAPI as DasyTemplateContext, parent, (oWatcher.path as JSONPath).asPath(), oRenderParent?.templateAPI, oOwnerParent?.templateAPI);
                if (typeof value === 'function')
                    this.throwNestedRenderFunction(template);
                return value;
            } finally {
                renderContext.currentWatcher = previousWatcher;
            }
        });
    }

    /**
     * Constructor: validates the data (no redundant references),
     * creates a backup, creates the rootWatcher, and renders
     * the initial DOM tree into the container.
     */
    constructor({ data, container, beforeRefresh, afterRefresh }: DasyRootParams, template: DasyTemplateFunction) {
        assertNoReferenceRedundancies(data, 'dasy data');
        this.#backup = structuredClone(data);
        this.#data = data;
        this.#container = container;
        this.#beforeRefresh = beforeRefresh;
        this.#afterRefresh = afterRefresh;
        const renderContext = Dasy.#createRenderContext();
        this.#rootWatcher = new DasyWatcher({ dasy: this, path: new JSONPath([]), parent: container, template });
        container.append(this.renderTemplate(template, data, this.#rootWatcher, container, renderContext, undefined, undefined));
    }

    get data(): object {
        return this.#data as object;
    }

    get container(): HTMLElement {
        return this.#container as HTMLElement;
    }

    throwNestedRenderFunction = (position: unknown): never => {
        throw new TypeError('Render function leaked into output. If you return {dasy}.for(...) or {dasy}.with(...) from another callback, wrap it in html`<div>${...}</div>` or another element.\n' + String(position));
    }

    /**
     * Renders template to a DOM node.
     *
     * 1. Sets the currentWatcher in the renderContext.
     * 2. Calls the template function (data, templateAPI, parent, path, ...).
     * 3. Handles the return value:
     *    - undefined/null/false → empty DocumentFragment
     *    - function → error (render function leak)
     *    - primitive → wrapped in text node
     *    - Node → returned directly
     */
    renderTemplate(template: DasyTemplateFunction, data: unknown, oWatcher: DasyWatcher, parent: Element | Attr, renderContext: DasyRenderContext, oRenderParent?: DasyWatcher, oOwnerParent?: DasyWatcher): Node {
        const fragment = this.#invokeTemplate(template, data, oWatcher, parent, renderContext, oRenderParent, oOwnerParent);
        if (fragment === undefined || fragment === null || fragment === false)
            return document.createDocumentFragment();
        if (typeof fragment !== 'object') {
            const node = document.createDocumentFragment();
            node.append(document.createTextNode(String(fragment)));
            return node;
        }
        return fragment as Node;
    }

    /**
     * Renders template for an attribute value.
     *
     * Same flow as renderTemplate, but:
     * - Only allows string/number/boolean/null/undefined values.
     * - Returns HTMLAttributeValue, not Node.
     */
    renderTemplateValue(template: DasyTemplateFunction, data: unknown, oWatcher: DasyWatcher, parent: Attr, renderContext: DasyRenderContext, oRenderParent?: DasyWatcher, oOwnerParent?: DasyWatcher): HTMLAttributeValue {
        const value = this.#invokeTemplate(template, data, oWatcher, parent, renderContext, oRenderParent, oOwnerParent);
        if (value === null || value === undefined)
            return value;
        const type = typeof value;
        if (type !== 'string' && type !== 'number' && type !== 'boolean')
            throw new TypeError('Attribute binding only usable for string, number, boolean, null or undefined values');
        return value as HTMLAttributeValue;
    }

    /**
     * Registers a watcher in the path-based index map.
     * The key is path.asKey() (with null-byte delimiter), the value is a Set<DasyWatcher>.
     */
    addWatcher(oNewWatcher: DasyWatcher): void {
        const key = (oNewWatcher.path as JSONPath).asKey();
        const map = this.#map as Map<string, Set<DasyWatcher>>;
        let node = map.get(key);
        if (!node)
            map.set(key, node = new Set());
        node.add(oNewWatcher);
    }

    /**
     * Removes a watcher from the path-based index map.
     * If the Set is empty, also deletes the key from the Map.
     */
    #removeWatcherFromMap(oWatcher: DasyWatcher): void {
        const key = (oWatcher.path as JSONPath).asKey();
        const map = this.#map as Map<string, Set<DasyWatcher>>;
        const node = map.get(key);
        if (!node)
            return;
        node.delete(oWatcher);
        if (node.size === 0)
            map.delete(key);
    }

    /**
     * Removes a watcher from the system.
     *
     * 1. Removes from the map (#removeWatcherFromMap).
     * 2. Removes from the ownerParent children list.
     * 3. Calls the watcher disconnect (DOM + property cleanup).
     */
    removeWatcher(oWatcher: DasyWatcher, oOwnerWatcher: DasyWatcher | undefined = oWatcher.ownerParent): void {
        this.#removeWatcherFromMap(oWatcher);
        const ownedWatchers = oOwnerWatcher?.children;
        if (ownedWatchers) {
            const index = ownedWatchers.indexOf(oWatcher);
            if (index !== -1)
                ownedWatchers.splice(index, 1);
        }
        oWatcher.disconnect();
    }

    /**
     * Updates a watcher's content based on the current data.
     *
     * - For Attr: clearChildren → renderAttribute → applyAttributeBindingValue.
     * - For Element: clearChildren → clearContentDOMNodes → renderTemplate → insertBefore(endNode).
     */
    #update(oWatcher: DasyWatcher, renderContext: DasyRenderContext): void {
        if (oWatcher.parent instanceof Attr) {
            oWatcher.clearChildren();
            const value = oWatcher.renderAttribute(getByPath(this.#data as object, oWatcher.path as JSONPath), renderContext);
            this.applyAttributeBindingValue(oWatcher.parent, value, oWatcher.attributeOwner);
            return;
        }
        oWatcher.clearChildren();
        oWatcher.clearContentDOMNodes();
        (oWatcher.parent as Element).insertBefore(this.renderTemplate(oWatcher.template as DasyTemplateFunction, getByPath(this.#data as object, oWatcher.path as JSONPath), oWatcher, oWatcher.parent as Element, renderContext, oWatcher.renderParent, oWatcher.ownerParent), oWatcher.endNode as Text);
    }

    applyAttributeBindingValue(oAttr: Attr, vValue: unknown, ownerElement = oAttr.ownerElement ?? undefined) {
        if (vValue === undefined || vValue === null) {
            if (ownerElement && ownerElement.namespaceURI !== 'http://www.w3.org/2000/svg') {
                const properties = (ownerElement as unknown) as Record<string, unknown>;
                properties[oAttr.name] = typeof properties[oAttr.name] === 'boolean' ? false : '';
            }
            ownerElement?.removeAttribute(oAttr.name);
            return;
        }
        if (ownerElement && oAttr.ownerElement !== ownerElement)
            ownerElement.setAttributeNode(oAttr);
        const sValue = String(vValue);
        oAttr.value = sValue;
        if (ownerElement && ownerElement.namespaceURI !== 'http://www.w3.org/2000/svg')
            ((ownerElement as unknown) as Record<string, string>)[oAttr.name] = sValue;
    };

    /**
     * Rebuilds the array watcher subtree from iStartIndex.
     *
     * 1. Deletes inner watchers starting from iStartIndex (reverse order).
     * 2. Creates new watchers according to the data array length,
     *    renders them, and inserts them into the DOM.
     * Called after diff del/ins operations.
     */
    #rebuildTail(oBaseWatcher: DasyWatcher, iStartIndex: number, renderContext: DasyRenderContext): void {
        const { path, parent, template, emptyTemplate } = oBaseWatcher;
        const children = oBaseWatcher.children ??= [];
        const data = getByPath(this.#data as object, path as JSONPath) as any[];
        for (let i = children.length - 1; i >= iStartIndex; i--)
            this.removeWatcher(children[i], oBaseWatcher);
        for (let i = iStartIndex; i < data.length; i++) {
            const newWatcher = oBaseWatcher.createWatcher({
                path: new JSONPath([...(path as JSONPath), i]),
                parent: parent as Element | Attr,
                template: template as DasyTemplateFunction,
                ownerParent: oBaseWatcher,
                renderParent: oBaseWatcher.renderParent,
            });
            const fragment = newWatcher.render(data[i], renderContext);
            oBaseWatcher.registerChild(newWatcher);
            (parent as Element).insertBefore(fragment as Node, oBaseWatcher.endNode as Text);
        }
        if (data.length === 0 && emptyTemplate) {
            const emptyWatcher = oBaseWatcher.createWatcher({
                path: path as JSONPath,
                parent: parent as Element | Attr,
                template: emptyTemplate,
                ownerParent: oBaseWatcher,
                renderParent: oBaseWatcher.renderParent,
            });
            const fragment = emptyWatcher.render(data, renderContext);
            oBaseWatcher.registerChild(emptyWatcher);
            (parent as Element).insertBefore(fragment as Node, oBaseWatcher.endNode as Text);
        }
    }

    /**
     * Collects the starting indices of structural array changes (ins/del).
     *
     * If an ins/del diff modifies an index within another array,
     * previous indices need to be updated so the rebuild starts
     * from the correct position.
     *
     * E.g., if [.items] del 2 and [.items[1].x] exists,
     * the [.items] del start decreases to 1, because the [1] index
     * was before the del.
     */
    #collectStructuralArrayRebuildStarts(aDiffs: DasyDiffEntry[]): Map<string, number> {
        const arrayDiffs: { key: string; path: JSONPath; start: number }[] = [];
        for (const [path, type, key] of aDiffs)
            if (type === 'ins' || type === 'del')
                arrayDiffs.push({ key: path.asKey(), path, start: key as number });
        for (const [path] of aDiffs)
            for (const arrayDiff of arrayDiffs) {
                if (path.length <= arrayDiff.path.length)
                    continue;
                let prefix = true;
                for (let i = 0; i < arrayDiff.path.length; i++)
                    if (path[i] !== arrayDiff.path[i]) {
                        prefix = false;
                        break;
                    }
                if (!prefix)
                    continue;
                const index = path[arrayDiff.path.length];
                if (typeof index === 'number' && index < arrayDiff.start)
                    arrayDiff.start = index;
            }
        return new Map(arrayDiffs.map(entry => [entry.key, entry.start]));
    }

    /**
     * Filters watchers based on diff type.
     *
     * - For 'ins' or 'del': prefers kind='for' watchers (array directive),
     *   because structural changes affect the for.
     * - Otherwise (val/set/rem): prefers kind='with' watchers,
     *   because value changes affect the content.
     * If the first group is empty, chooses from the other.
     */
    #selectWatchersForDiff(aWatchersAtPath: DasyWatcher[], sType: DasyDiffKind): DasyWatcher[] {
        const preferredKind: DasyWatcherKind = sType === 'ins' || sType === 'del' ? 'for' : 'with';
        const preferredWatchers = aWatchersAtPath.filter(watcher => watcher.kind === preferredKind);
        if (preferredWatchers.length)
            return preferredWatchers;
        return aWatchersAtPath.filter(watcher => watcher.kind !== preferredKind); // fallbackWatchers
    }

    /**
     * Iterates diffs and synchronizes DOM.
     *
     * Two passes:
     * 1. DOM update: for each diff entry, selects the appropriate
     *    watchers and calls insert/delete/update methods.
     * 2. Backup update: replays the same diffs onto the backup via
     *    the shared diff application helper.
     */
    #applyDiffsAndSync(aDiffs: DasyDiffEntry[], renderContext: DasyRenderContext): void {
        const arrayRebuildStarts = this.#collectStructuralArrayRebuildStarts(aDiffs);
        aDiffs.forEach(([path, type, key, value]) => {
            const diffKey = path.asKey();
            const watchersAtPath = Array.from(this.#map?.get(diffKey) ?? []);
            const watchers = this.#selectWatchersForDiff(watchersAtPath, type);
            for (const watcher of watchers) {
                if (watcher.dasy !== this)
                    continue;
                if (watcher.kind === 'for' && (type === 'ins' || type === 'del' || type === 'val'))
                    this.#rebuildTail(watcher, type === 'val' ? 0 : (arrayRebuildStarts.get(diffKey) ?? (key as number)), renderContext);
                else
                    this.#update(watcher, renderContext);
            }
        });
        this.#backup = applyDiffs(this.#backup as object, aDiffs).target;
    }

    /**
     * Top-level update method.
     *
     * 1. Validates the data (no redundant references).
     * 2. Generates diff between backup and data (diffDeep).
     * 3. Creates a new renderContext for the current refresh pass.
     * 4. Applies diffs and DOM synchronization (#applyDiffsAndSync).
     */
    refresh(): void {
        this.#beforeRefresh?.(this.#data as object);
        assertNoReferenceRedundancies(this.#data as object, 'dasy data');
        const diffs = diffDeep(this.#backup as object, this.#data as object);
        const renderContext = Dasy.#createRenderContext();
        this.#applyDiffsAndSync(diffs, renderContext);
        this.#afterRefresh?.(this.#data as object);
    }

    /**
     * Full disconnect: rootWatcher disconnect, map/data/backup cleanup.
     */
    disconnect(): void {
        this.#rootWatcher!.disconnect(); this.#rootWatcher = undefined;
        this.#map!.clear(); this.#map = undefined;
        this.#backup = undefined; this.#data = undefined;
        this.#container = undefined;
    }

    /**
     * Debug / diagnostic method.
     *
     * Returns a detailed description of the Dasy state:
     * - root watcher tree structure
     * - watchers for each path
     * - dangling (unreachable) indexed watchers
     * - unindexed reachable watchers
     *
     * Usage: for debugging, memory leak detection,
     * watcher tree validation.
     */
    dump(): any {
        if (!this.#map) {
            return {
                disconnected: true,
                reachableWatcherCount: 0,
                indexedWatcherCount: 0,
                mapPathCount: 0,
                root: null,
                paths: [],
                danglingIndexedWatchers: [],
                unindexedReachableWatchers: [],
            };
        }

        const formatPath = (watcher: DasyWatcher | undefined): string => {
            if (!watcher?.path)
                return '<disconnected>';
            return watcher.path.asPath();
        };
        const describeWatcher = (watcher: DasyWatcher) => ({
            path: formatPath(watcher),
            type: watcher.kind,
            innerCount: watcher.children?.length ?? 0,
            connected: Boolean(watcher.startNode?.isConnected || watcher.endNode?.isConnected || watcher.parent instanceof Attr),
        });
        const describeTree = (watcher: DasyWatcher | undefined): any => watcher ? ({
            ...describeWatcher(watcher),
            children: (watcher.children ?? []).map(describeTree),
        }) : null;

        const reachable = new Set<DasyWatcher>();
        const reachableList: DasyWatcher[] = [];
        const visit = (watcher: DasyWatcher | undefined): void => {
            if (!watcher || reachable.has(watcher))
                return;
            reachable.add(watcher);
            reachableList.push(watcher);
            for (const inner of watcher.children ?? [])
                visit(inner);
        };
        visit(this.#rootWatcher);

        const indexedWatchers: DasyWatcher[] = [];
        const paths = Array.from(this.#map.values(), watchers => {
            const list = Array.from(watchers);
            indexedWatchers.push(...list);
            return {
                path: formatPath(list[0]),
                count: list.length,
                watchers: list.map(describeWatcher),
            };
        }).sort((a, b) => a.path.localeCompare(b.path));

        const indexed = new Set(indexedWatchers);
        return {
            disconnected: false,
            reachableWatcherCount: reachableList.length,
            indexedWatcherCount: indexedWatchers.length,
            mapPathCount: this.#map.size,
            root: describeTree(this.#rootWatcher),
            paths,
            danglingIndexedWatchers: indexedWatchers.filter(watcher => !reachable.has(watcher)).map(describeWatcher),
            unindexedReachableWatchers: reachableList.filter(watcher => watcher !== this.#rootWatcher && !indexed.has(watcher)).map(describeWatcher),
        };
    }
}

/**
 * Creates a Dasy instance.
 *
 * Parameters:
 * - data: the data model (object, no redundant references)
 * - container: the DOM element where the rendered content goes
 * - template: the template function (html`...` or svg`...`)
 *
 * Returns: a Dasy instance that controls rendering and updates.
 */
function dasy(oParams: DasyRootParams, fTemplate: DasyTemplateFunction): Dasy {
    return new Dasy(oParams, fTemplate);
}

export { html, svg, dasy, JSONUndoBuffer };