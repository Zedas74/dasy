import { html } from '../dist/dasy.mjs';

export function render(container) {
	let oSpan;
	let iCounter = 0;
	const sText = 'This is a text from a variable';
	const sColor = 'red';

	// The html template literal function does the magic: it converts the text to DOM and returns a DocumentFragment.
	// (A DocumentFragment holds HTML nodes.) This works in real time, without precompilation.
	// Tip: In VSCode use the 'es6-string-html' plugin to add coloring to the html code.

	container.append(html`

<!-- This is an example to add attribute value and text to the DOM. -->
<!-- You can't mix string and dynamic data in an attribute, so the style="color: \${sColor}" code not allowed. -->

<p><span style="${`color: ${sColor}`}">${sText}</span></p>

<hr/><!----------------------------------------------------------------------->

<!-- If the expression is a function, the 'parent' HTMLElement always appears as the first parameter.  -->
<!-- The function's result value is used as replacement value. -->

<p>Counter: <span>${parent => { oSpan = parent; return iCounter; }}</span></p>

<!-- All on* attributes are special, the expression used as an event handler. -->
<!-- The 'onClick' converted to a 'click' event. The letter after the 'on' must be uppercase. -->

<p><button onClick="${e => oSpan.innerHTML = ++iCounter}">Increase counter</button></p>

<hr/><!----------------------------------------------------------------------->

<!-- In this example, the value is set when the select element is created, before the options appear, so it has no effect. -->

<p><select value="${3}"><option value="1">One</option><option value="2">Two</option><option value="3">Three</option></select></p>

<!-- The ps* attribute solves this problem: the attribute only set after the parser arrives to the </select>. -->

<p><select psValue="${3}"><option value="1">One</option><option value="2">Two</option><option value="3">Three</option></select></p>

	`);
};