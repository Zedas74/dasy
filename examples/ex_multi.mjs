import { dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		form: {
			counter: 1
		}
	};

	const page = dasy({ data, container, afterRefresh }, (_, root) => root.html`
		${
		// This will create an array of HTMLElements with ten counter DIVs.
		// The html template literal will insert all elements into the DOM.
		new Array(10).fill(0).map((_, i) => 
			
			// The magic is in the .use() method, which creates a live data watcher for the counter.
			// When the data changes, all of the counters will follow. Only the counters will change
			// in the DOM!
				// The .use() method only works with an object!
				root.html`<div>Counter-${i}: ${root.use('.form', o => o.counter)}</div>`
			)
		}<div>
			<!-- This will change the data and trigger the dasy refresh. -->
			<button onClick="${() => { data.form.counter++; root.refresh(); }}">+1</button>

			<!-- The .refresh() method also available through the result object of the dasy(). -->
			<button onClick="${() => { data.form.counter++; page.refresh(); }}">+1</button>

			<!-- Same functionality, but we change the data through the root context. -->
			<!-- The .set() method works with all data types, and automatically initialize the refresh. -->
			<button onClick="${() => root.set('.form.counter', data.form.counter +1)}">+1</button>

			<!-- Same functionality, but we use the set method with a modifier function. -->
			<button onClick="${() => root.set('.form.counter', i => i +1)}">+1</button>
		</div>
	`);
}