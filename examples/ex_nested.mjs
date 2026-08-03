import { dasy, html } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		counters: {
			first: 1,
			second: {
				value: 2
			}
		}
	};

	dasy({ data, container, afterRefresh }, (_, root) => html`
		<div>
			<div class="counters">${

				// `$` is the 'counters' object from the data; `outer` is its context.
				root.with('.counters', ($, outer) => html`
					<p>Outer counter: <b>${$.first}</b></p>
					<p>Inner counter: <b>${

						// This context is based on the 'outer' context, not the root.
						// The '.second' path is related to the 'counters' object.
						outer.with('.second', $ => $.value)
					}</b></p>`)
			}</div>
			<p>
				<button class="demo-button" onClick="${() => 
					root.set('.counters.first', i => i +1)}">Outer +1</button>
				<button class="demo-button" onClick="${() => 
					root.set('.counters.second.value', i => i +1)}">Inner +1</button>
			</p>
			<p>
				<button onClick="${e => e.target.closest('div').querySelectorAll('div.counters p')
					.forEach(o => o.style.color = 'red')}">Colorize DOM to show changes</button>
			</p>
		</div>
	`);
}