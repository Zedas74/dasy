import { html, dasy, DasyDataSource } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		form: {
			counter: 1
		}
	};

	// This component gives the functionality of Redux or Zustand to Dasy
	const dataSource = new DasyDataSource(data);
	
	// This dasy component works exactly like if it only owns the data.
	dasy({ dataSource, container, afterRefresh }, (_, { html, use, set }) => html`
		<p>
			<b>First dasy on the same data</b>
			<span>Counter: ${use('.form', o => o.counter)}</span>
			<button onClick="${() => set('.form.counter', i => i +1)}">+1</button>
		</p>
		<hr/>
	`);

	dasy({ dataSource, container, afterRefresh }, (_, { html, use, set }) => html`
		<p>
			<b>Second dasy on the same data</b>
			<span>Counter: ${use('.form', o => o.counter)}</span>
			<button onClick="${() => set('.form.counter', i => i +1)}">+1</button>
		</p>
	`);

	container.append(html`<hr/><button onClick="${e => { 
		data.form.counter--; 
		dataSource.refresh(); 
	}}">External control</button>`);
}