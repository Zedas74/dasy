type HTMLAttributeValue = string | number | boolean | null | undefined;
type TemplateFunction = (...args: any[]) => unknown; // For arrow functions in the ${...} parts
type TimedAttrs = Array<[Attr, HTMLAttributeValue]>;
type CloserEntry = [ name: string, target: Element, attrs: TimedAttrs, pos: number ];

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// HTML
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

class HTMLTemplate {
    /**
     * Regex token that extracts elements,
     * attributes, comments and closers from the HTML template string.
     *
     * Groups:
     * - cmt: <!-- comment -->
     * - eln: <elementName
     * - atn/atv: attributeName="value"
     * - atl: attributeName (without value)
     * - ats: attributeName (short, self-closing)
     * - quo: " (quote)
     * - elc: </elementName>
     * - cle: elementName (self-closing closer)
     */
    //.................cmt..............eln......................atn, atv................atl...............ats........................quo.elc....cle........................
    static reToken = /(<!\-\-(.*?)\-\->|<([a-zA-Z][a-zA-Z0-9-]*)|\s+([a-zA-Z-]+)="(.*?)"|\s+([a-zA-Z-]+)="|\s+([a-zA-Z-]+)(?=\s|\/?>)|(")|(\/?>)|<\/([a-zA-Z][a-zA-Z0-9-]*)>)/gms;
    // detects onX attribute name (event listener).
    static reOn = /^on[A-Z]/;
    // detects psX attribute name (live attribute binding).
    static rePs = /^ps[A-Z]/;

    /**
     * Throw error when a render function leaks into the output.
     * This happens when the render function returned from a template callback
     * is not wrapped in html`<div>${...}</div>`.
     */
    throwNestedRenderFunction = (sAt: string | undefined): never => {
        throw new TypeError(`Render function leaked into output${sAt ? ` at '${sAt}'` : ''}`);
    }
    /**
     * Throw error when mixed static and dynamic content exists
     * in an attribute. Only fully dynamic attribute values
     * are allowed.
     */
    throwMixedAttributeValue = (sAttrName: string, sAt: string | undefined): never => {
        throw new TypeError(`Mixed static and dynamic content in attribute '${sAttrName}'${sAt ? ` at '${sAt}'` : ''}`);
    }
    /**
     * Determine whether a value can be omitted when writing to the DOM.
     * undefined and null are ignorable (output nothing).
     */
    isIgnorableValue(v: unknown) {
        return v === undefined || v === null;
    }
    /**
     * Convert 'onAbcDe' or 'psAbcDe' to 'abcDe'
     */
    removePrefix(s: string) {
        return s.slice(2, 3).toLowerCase() +s.slice(3);
    }
    /**
     * Apply attribute binding value to an Attr node.
     *
     * 1. Removes the attribute when the value is nullish.
     * 2. Otherwise sets Attr.value to the string form of the value.
     * 3. Also updates the property binding
     *    (dynamic property assignment).
     */
    applyAttributeBindingValue(oAttr: Attr, vValue: HTMLAttributeValue) {
        const ownerElement = oAttr.ownerElement;
        if (this.isIgnorableValue(vValue)) {
            if (ownerElement) {
                ((ownerElement as unknown) as Record<string, unknown>)[oAttr.name] = typeof ((ownerElement as unknown) as Record<string, unknown>)[oAttr.name] === 'boolean' ? false : '';
                ownerElement.removeAttribute(oAttr.name);
            }
            return;
        }
        const sValue = String(vValue);
        oAttr.value = sValue;
        if (ownerElement)
            ((ownerElement as unknown) as Record<string, string>)[oAttr.name] = sValue;
    }

    createElement(sTagName: string): Element {
        return document.createElement(sTagName);
    }

    // Add the ${...} expression's value to the DOM
    appendValue(oParent: DocumentFragment | Element, vValue: unknown, sChunk: string, getErrorPos?: () => string): void {
        if (this.isIgnorableValue(vValue)) 
            return;
        if (typeof vValue === 'function') {
            vValue = (vValue as TemplateFunction)(oParent);
            if (typeof vValue === 'function')
                this.throwNestedRenderFunction(getErrorPos?.());
        }
        if (Array.isArray(vValue)) {
            for (const item of vValue) 
                this.appendValue(oParent, item, sChunk, getErrorPos);
            return;
        }
        if (vValue instanceof Node) {
            oParent.append(vValue);
            return;
        }
        oParent.append(document.createTextNode(String(vValue)));
    }

    parser(aChunks: TemplateStringsArray, aValues: unknown[]): DocumentFragment {
        const oResult = document.createDocumentFragment();

        let oCurrentElement: Element;
        let oParent: DocumentFragment | Element = oResult;
        let bQuoteExpected = false;
        let bAttributeExpected = false;
        const aClosers: CloserEntry[] = [];
        let sPendingTimedAttributeName: string | undefined; // Live attribute names are starts with 'ps', and only added after
        // the current element is inserted to the DOM
        const sAllTexts = aChunks.join('${…}');
        let iAllPos = 0;

        const getErrorPos = (iPos: number, iSize?: number) => {
            const iAt = iAllPos +iPos;
            const iRange = 40;
            if (iSize) {
                const iEnd = iAt +iSize;
                return `${iAt -iRange > 0 ? '…' : ''}${sAllTexts.slice(Math.max(iAt -iRange, 0), iAt)}→${
                    sAllTexts.slice(iAt, iEnd)}←${sAllTexts.slice(iEnd, iEnd +iRange)}${
                    iEnd +iRange < sAllTexts.length ? '…' : ''}`;
            }
            return `${iAt -iRange > 0 ? '…' : ''}${sAllTexts.slice(Math.max(iAt -iRange, 0), iAt)}→${
                sAllTexts.slice(iAt, iAt +iRange)}${iAt +iRange < sAllTexts.length ? '…' : ''}`;
        }

        aChunks.forEach((sChunk, iChunkIndex) => { // Array of template literal (the string parts between code)
            HTMLTemplate.reToken.lastIndex = 0;
            let aExp: RegExpExecArray | null;
            let iPreviousEnd = 0;
            let bValueUsed = false;

            while ((aExp = HTMLTemplate.reToken.exec(sChunk))) {
                const [m,, cmt, eln, atn, atv, atl, ats, quo, elc, cle] = aExp;
                const iMatchLen = m.length;
                const iCurrentPos = aExp.index;

                if (cmt !== undefined) { // Comment
                    if (bAttributeExpected || bQuoteExpected)
                        throw new TypeError(`Comment not allowed in element declaration at '${getErrorPos(iCurrentPos, iMatchLen)}'`);
                    oParent.append(document.createComment(cmt));
                    iPreviousEnd = HTMLTemplate.reToken.lastIndex;
                    continue;
                }

                const bIgnorableToken = atn !== undefined || atl !== undefined || ats !== undefined ||
                    quo !== undefined || elc !== undefined;
                if (!bAttributeExpected && !bQuoteExpected && bIgnorableToken) {
                    // <div>2 > 1</div>, <div>"hello"</div>, <div>class="example"</div>
                    continue;
                }

                const iTextStart = iPreviousEnd;
                const sText = sChunk.slice(iTextStart, iCurrentPos);
                if (bQuoteExpected && sText) {
                    if (sPendingTimedAttributeName)
                        this.throwMixedAttributeValue(sPendingTimedAttributeName, getErrorPos(iCurrentPos));
                    throw new TypeError(`Quote missing at '${getErrorPos(iCurrentPos)}'`);
                }
                if (bAttributeExpected) {
                    if (sText.trim())
                        throw new TypeError(`Attribute expected at '${getErrorPos(iCurrentPos)}'`);
                } else if (sText)
                    this.appendValue(oParent, sText, sChunk, () => getErrorPos(iCurrentPos));
                iPreviousEnd = HTMLTemplate.reToken.lastIndex;
                if (bQuoteExpected && quo === undefined)
                    throw new TypeError(`Quote missing at '${getErrorPos(iCurrentPos)}'`);
                if (bAttributeExpected && atn === undefined && atl === undefined && ats === undefined && 
                    quo === undefined && elc === undefined)
                    throw new TypeError(`Attribute expected at '${getErrorPos(iCurrentPos)}'`);

                if (eln !== undefined) { // Element name (start)
                    oCurrentElement = this.createElement(eln);
                    oParent.append(oCurrentElement);
                    oParent = oCurrentElement;
                    bAttributeExpected = true;
                    aClosers.push([eln, oCurrentElement, [], iCurrentPos]); // We have to find a closer later for this tag
                } else if (atn !== undefined && atv !== undefined) { // Full literal attribute
                    if (atn === 'is') {
                        // This is required, when 'is' attribute found. Custom elements are not simple Elements.
                        const oCustomElement = document.createElement(oCurrentElement.localName, { is: atv });
                        for (const attr of oCurrentElement.attributes)
                            oCustomElement.setAttribute(attr.name, attr.value);
                        oCurrentElement.replaceWith(oCustomElement);
                        oCurrentElement = oCustomElement;
                        const aCloser = aClosers.at(-1);
                        if (aCloser)
                            aCloser[1] = oCustomElement;
                        oParent = oCustomElement;
                    }
                    oCurrentElement.setAttribute(atn, atv);
                } else if (atl !== undefined) { // Attribute name before code, like: value="
                    const vValue = aValues[iChunkIndex];
                    const fnValue = typeof vValue === 'function' ? vValue as ((attr: Attr) => HTMLAttributeValue) : undefined;
                    if (HTMLTemplate.reOn.test(atl) && fnValue) { // onClick → click, etc.
                        oCurrentElement.addEventListener(this.removePrefix(atl), vValue as EventListener);
                    } else if (HTMLTemplate.rePs.test(atl)) { // Timed attribute
                        const sName = this.removePrefix(atl);
                        const oAttr = document.createAttribute(sName);
                        const aCloser = aClosers.at(-1);
                        if (aCloser)
                            aCloser[2].push([oAttr, fnValue?.(oAttr) ?? vValue as HTMLAttributeValue]);
                    } else {
                        const oAttr = document.createAttribute(atl);
                        oCurrentElement.setAttributeNode(oAttr);
                        this.applyAttributeBindingValue(oAttr, fnValue?.(oAttr) ?? vValue as HTMLAttributeValue);
                    }
                    bValueUsed = true;
                    bQuoteExpected = true;
                    sPendingTimedAttributeName = atl;
                } else if (ats !== undefined) { // Solo attribute, like: disabled
                    oCurrentElement.setAttribute(ats, ats);
                } else if (quo !== undefined) { // Quote (")
                    bQuoteExpected = false;
                    sPendingTimedAttributeName = undefined;
                } else if (elc !== undefined) { // Element closer
                    if (elc[0] === '/') {
                        let aTimedAttrs: TimedAttrs = [];
                        const aCloser = aClosers.pop();
                        if (!aCloser)
                            throw new TypeError(`Unexpected self-close '${elc}' at '${getErrorPos(iCurrentPos)}'. No open element is available to close.`);
                        [, oCurrentElement, aTimedAttrs] = aCloser;
                        aTimedAttrs.forEach(([attr, attrValue]) => {
                            oCurrentElement.setAttributeNode(attr);
                            this.applyAttributeBindingValue(attr, attrValue);
                        });
                        oParent = (oParent.parentNode ?? oResult) as DocumentFragment | Element;
                    }
                    bAttributeExpected = false;
                } else if (cle !== undefined) { // Self closing element ending
                    let sPrevious = '';
                    let aTimedAttrs: TimedAttrs = [];
                    const aCloser = aClosers.pop();
                    if (!aCloser)
                        throw new TypeError(`Unexpected close element '</${cle}>' at '${getErrorPos(iCurrentPos, cle.length +3)}'. No open element is available to close.`);
                    [sPrevious, oCurrentElement, aTimedAttrs] = aCloser;
                    if (sPrevious !== cle)
                        throw new TypeError(`Invalid close element for <${sPrevious}> at '${getErrorPos(iCurrentPos, cle.length +3)}'`);
                    aTimedAttrs.forEach(([attr, attrValue]) => {
                        oCurrentElement.setAttributeNode(attr);
                        this.applyAttributeBindingValue(attr, attrValue);
                    });
                    oParent = (oParent.parentNode ?? oResult) as DocumentFragment | Element;
                    bAttributeExpected = false;
                }
            }

            const sTailText = sChunk.slice(iPreviousEnd);
            if (sTailText) {
                if (bQuoteExpected) {
                    if (sPendingTimedAttributeName)
                        this.throwMixedAttributeValue(sPendingTimedAttributeName, getErrorPos(iPreviousEnd, sTailText.length));
                    throw new TypeError(`Quote missing at '${sTailText}'`);
                }
                if (bAttributeExpected) {
                    if (sTailText.trim())
                        throw new TypeError(`Attribute expected at '${getErrorPos(sChunk.length)}'`);
                } else {
                    this.appendValue(oParent, sTailText, sTailText);
                }
            }

            if (!bValueUsed && iChunkIndex < aValues.length) {
                if (bAttributeExpected && !this.isIgnorableValue(aValues[iChunkIndex]))
                    throw new TypeError(`Unexpected value in element declaration at '${getErrorPos(sChunk.length, 4)}'`);
                this.appendValue(oParent, aValues[iChunkIndex], sChunk, () => getErrorPos(sChunk.length, 4));
            }

            iAllPos += sChunk.length +4;
        });
        // if (bQuoteExpected)
        //     throw new TypeError('Quote missing at end of template');
        if (bAttributeExpected) {
            const aCloser = aClosers.at(-1);
            throw new TypeError(`Element closer '>' missing for '${aCloser![0]}' at '${getErrorPos(aCloser![3] ?? 0)}'`);
        }
        if (aClosers.length) {
            const aCloser = aClosers.at(-1);
            throw new TypeError(`Close element missing for '${aCloser![0]}' at '${getErrorPos(aCloser![3] ?? 0)}'`);
        }
        return oResult;
    };
}

/**
 * HTML template tag.
 *
 * Template tag usage: html`...`
 *
 * The parser builds a DOM tree from HTML text using regex.
 * Supports:
 * - Dynamic content: ${value} in template strings
 * - Event listeners: on{uppercase letter}{event name from 2nd letter}={fn} attributes. E.g.: onClick="${e => {}}"
 * - Delayed attributes that are set AFTER the element is inserted into the DOM: 
 *   ps{uppercase letter}{event name from 2nd letter}={value}. E.g.: psValue="${select_value}"
 * - Custom elements: is="..." attribute
 * - Comments: <!-- ... -->
 */
const htmlTemplate = new HTMLTemplate();

function html(chunks: TemplateStringsArray, ...values: unknown[]): DocumentFragment {
    return htmlTemplate.parser(chunks, values);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// SVG
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

class SVGTemplate extends HTMLTemplate {
    override applyAttributeBindingValue(oAttr: Attr, vValue: HTMLAttributeValue) {
        if (this.isIgnorableValue(vValue)) {
            const ownerElement = oAttr.ownerElement;
            ownerElement?.removeAttribute(oAttr.name);
            return;
        }
        oAttr.value = String(vValue);
    }

    override createElement(tag: string): Element {
        return document.createElementNS('http://www.w3.org/2000/svg', tag);
    }
}

/**
 * SVG template tag.
 *
 * Template tag usage: svg`...`
 *
 * Namespace: http://www.w3.org/2000/svg
 */
const svgTemplate = new SVGTemplate();

function svg(chunks: TemplateStringsArray, ...values: unknown[]): DocumentFragment {
    return svgTemplate.parser(chunks, values);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export { html, svg, type HTMLAttributeValue };