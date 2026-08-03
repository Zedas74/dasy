import { html, dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		forms: {
			test: {
				value: 'one',
				select: 1
			}
		}
	}

	dasy({ data, container, afterRefresh }, (_, root) => html`
		<div>
			<p>Edit field for value: <input value="${

				// We create a live attribute here, so the input element won't change itself.
				// The '$' is the 'test' object. The .with() method only works with objects!
				root.with('.forms.test', $ => $.value)}" onInput="${e => 
					
// This is the same as root.set('.forms.test.value', e.target.value)
					root.set('.forms.test.value', e)

				}"/></p>
			<p>Another edit for the same value: <input value="${
				root.with('.forms.test', $ => $.value)}" onInput="${e => root.set('.forms.test.value', e)}"/></p>
			<p>Echo of value: <b>${
				
				// Here the .with() method produces a text node.
				root.with('.forms.test', $ => $.value)
			}</b></p>
			<p>Alternative: ${

				// Here the .with() method produces a DocumentFragment.
				root.with('.forms.test', $ => html`<b>${$.value}</b>`)
			}</p>
			<p>Select example: <select psValue="${root.with('.forms.test', $ => $.select)}" onChange="${e => 
				root.set('.forms.test.select', e.target.value |0)}">${
					['Zero', 'One', 'Two', 'Three'].map((s, i) => html`<option value="${i}">${s}</option>`)
					// Alternative: ['Zero', 'One', 'Two', 'Three'].map((s, i) => new Option(s, i))
				}</select></p>
			<p>Selected value: <b>${root.with('.forms.test', $ => $.select)}</b></p>
			<hr/>
			<p>
				<button onClick="${() => 
					root.set('.forms.test.select', i => (i +1) % 4)
				}">Cycle select</button>
				<button onClick="${e => 
					e.target.closest('div').querySelectorAll('input,b,select').forEach((o, i) => 
						o.style ? o.style.color = 'red' : null)
				}">Colorize DOM to show changes</button>
			</p>
		</div>
	`);
}