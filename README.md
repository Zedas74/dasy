# HTML, SVG and Dasy

The `dasy()` function and the `html` template literal were created to make rendering data-driven HTML pages in the browser easier and simpler (it is like a lightweight React replacement).

**Please check the live demo collection to understand what is it good for!**

[Example demo collection](https://zedas74.github.io/dasy/examples/examples.html)

(If you are not familiar with template literals, [you can find an explanation here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals))

## How do I use it?

First install the package from NPM:

`npm install @zedas74/dasy`

Then, copy the `node_modules\@zedas74\dasy\dist\dasy.mjs` file to a location accessible by your client-side HTML (e.g. a static js folder).

Finally, include the module in your pages:

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">

    import { html, dasy } from './js/dasy.mjs';
    …

  </script>
</head>
<body>
</body>
</html>
```

## Okay, but what exactly is `html` for?

A long-standing problem is that creating DOM elements with events from JavaScript can be done in only two ways: either by creating elements manually using DOM manipulation methods, or by using string-based HTML and adding events afterward (for now, let's ignore classic "onclick" and similar events, as they cause numerous issues and are generally not recommended).

**DOM creation looks roughly like this:**
```js
const msg = 'Alert!';

// Create a DOM button
const button = document.createElement('button');
button.className = 'demo-button';
button.textContent = 'Alert';
document.body.append(button);

// Add the event
button.addEventListener('click', () =>
  input.value = alert(msg);
);
```
**The string-based version looks like this:**
```js
const msg = 'Alert!';

// Create an HTML button
document.body.innerHTML = '<button class="demo-button">Alert</button>';

// Add the event
const button = document.body.querySelector('.demo-button');
button.addEventListener('click', () =>
  input.value = alert(msg);
);
```
There are, of course, simpler solutions, but they either require translation or are extremely cumbersome to use.

**In contrast, `html` offers a simple, fast, and runtime-friendly way to mix HTML text and events:**
```js
const msg = 'Alert!';
document.body.append(html`<button class="demo-button" onClick="${() => alert(msg)}">Alert</button>`);
```
Any event can be inserted this way; the key is that its name must start with `on` followed by an uppercase letter. For example, `onClick` inserts a `click` event.

Attributes and text content can also be inserted naturally:
```js
const text = 'Alert', className = 'demo-button';
document.body.append(html`<button class="${className}">${text}</button>`);
```
The `html` function returns a `DocumentFragment`, which can be inserted, allowing elements to be nested within each other:
```js
const text = 'Alert', className = 'demo-button';
document.body.append(html`<button class="${className}">${html`<b>${text}</b>`}</button>`);
```
It is important not to mix static and dynamic parts within a single attribute. For example, this is problematic:
```js
html`<button class="class_${name}"/>`
```
This is the correct way:
```js
html`<button class="${'class_' + name}"/>`
```

The DOM produced by the `html` function can have multiple roots:
```js
html`<i>A</i><b>B</b>`;
```
```
There are attributes that are much better set after the children have been created. A good example is `value` on a select. It is applied during parsing before the `option`s exist, so it has no effect. Here, `psValue` means that the attribute is actually only written at the `</select>`, so the `select` is correctly set to the intended value.
```js
html`<select psValue="2">
  <option value="1">One</option>
  <option value="2">Two</option>
</select>`;
```

It is also worth knowing that if we put a function into the `html` code part, it always receives the current parent DOM element:
```js
let div;
html`<div>${parent => div = parent}</div>`);
```
If the function's return value is not `null` or `undefined`, then it is inserted into the output.

The `html` function also accepts value-less attributes, such as `selected`, and HTML comments.

The `html` function also has an alternative version (imported from the same place): `svg`. It does the same thing, but uses the SVG namespace for every element.

## What is dasy() for?

`dasy()` is a data-synchronization solution related to `html`.

Here is a simple `dasy` example:
```js
control = dasy({ data: { counter: { value: 0 } }, container: document.body }, (data, root) => html`
  <article class="counter-box">
    <label>dasy</label>
    <div class="button-row">${
      root.with('.counter', $ => html`
        <input class="demo-input" type="number" value="${$.value}"/>
      `)}
      <button class="demo-button" onClick="${() => {
        data.counter.value += 1;
        root.refresh();
      }}">+1</button>
    </div>
  </article>
`;
```

**What do we see here?**

dasy() is a function that expects a `data` object, a `container` object, and a template function.

- `data` can be any JSON object, which means it cannot contain recursion, multiple references, and so on.
- `container` will hold the rendered template.
- Optional callbacks: `beforeRefresh` runs before every refresh (good for derived data), `afterRefresh` runs after.
- Every template function has two parameters by default:
  - In the root template, `data` always matches the `data` object passed in as the argument.
  - `root` is a special object, whose `with` method we use in the example.

**What is `with` good for?**

`with` runs an inner template function on a part of `data` (in the example, the inner `.counter` object), and dasy inserts it in place of the `with` call. In addition, it creates a live link between the data and the DOM in the background, so if we modify anything inside the part managed by `with` (at any depth), the part described by the template is refreshed in the DOM (**and only that part**).

In the example, pressing the button increments `data.counter.value`, and then we ask the whole dasy instance to refresh itself. dasy then figures out which template part inside the `with` is affected, and rebuilds only that part.

The `$` variable in the example is the relevant part of the original JSON object, sliced out by the `.counter` path, which here is `{ value: 0 }`. In the root template `$` and `data` are the same, but in a nested `with()`/`for()` callback `$` is the selected slice.

## `For` method

Here is a simple example of using `for`, where we can edit the values of a small table and increase the table size:

```js
const data = {
	grid: [
		['0.0', '0.1'],
		['1.0', '1.1'],
	]
}

const oPage = dasy({ data, container: document.body }, (_, root) => html`
  <div>
    <table>${
      root.for('.grid', (_, row) => html`<tr>${
        row.for(($, cell) => html`<td><input style="background:transparent; color: inherit; border: none" 
          value="${$}" onChange="${cell.set}"/></td>`)
      }</tr>`)
    }</table><br/>
    <button onClick="${() => { data.grid.push(data.grid[0].map((_, i) => `${data.grid.length}.${i}`)); root.refresh(); }}">Add row</button>
    <button onClick="${() => { data.grid.forEach((a, i) => a.push(`${i}.${a.length}`)); root.refresh(); }}">Add col</button>
  </div>`);
```

**What do we see here?**

- `(_, root)` swallows the template data object; we do not need it, because we can access it through the original `data` variable.
- `root.for` works similarly to `root.with`, but the object addressed by the path must be an array, and the template is rendered for every array element.
- The inner `row.for` does not contain a path, because it uses the parent data directly (it would be equivalent to calling `row.for('', ($, cell) => … )`).
- The `cell.set` shorthand is actually equivalent to this: `e => cell.set(e)`, which is in fact this: `e => cell.set('', e)`. And that is equivalent to this: `e => set('', e.target.value)`.
- `set` really just writes the value back into the data and calls `dasy.refresh()`. Obviously, if multiple fields change at once, that is not economical, and it is better to call `refresh()` separately, as you can also see with the buttons.
- You can also pass an event object directly: `root.set('.form.value', e)` reads `e.target.value`.
- Or pass a modifier function: `root.set('.form.counter', i => i + 1)`.
- `for()` accepts an optional second template that is rendered when the array is empty.
- dasy makes it possible, for example, when adding columns, for the other rendered <td> elements not to change.

## Nested contexts

`with()` and `for()` return a context object that works like `root` but is bound to the selected path. You can nest them:

```js
root.with('.counters', ($, outer) => html`
  <p>Outer: <b>${$.first}</b></p>
  <p>Inner: <b>${outer.with('.second', $ => $.value)}</b></p>
`)`
```

## Destroying a dasy instance

A `dasy()` instance can be removed with `disconnect()`, which cleans up its DOM and watchers:

```js
const page = dasy({ data, container }, template);
page.disconnect();
```

## Undo / Redo

`dasy.mjs` exports a `JSONUndoBuffer` helper. Create it from your data, call `snapshot()` after changes, then use `undo()` / `redo()` and refresh:

```js
import { JSONUndoBuffer } from './dasy.mjs';

const undoBuffer = new JSONUndoBuffer(data);

const page = dasy({ data, container }, …)

// after a change
undoBuffer.snapshot();

// later
undoBuffer.undo(); // or .redo()
page.refresh();
```

## Highlight in VSCode

The HTML code inside `html` is not highlighted automatically by VSCode, but there are extensions that can handle this, for example [es6-string-html](https://marketplace.visualstudio.com/items?itemName=Tobermory.es6-string-html).
