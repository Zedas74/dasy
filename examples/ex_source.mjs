import { dasy, html, DasyDataSource } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		form: {
			counter: 1
		}
	};

	const dataSource = new DasyDataSource(data);
	
	dasy({ dataSource, container, afterRefresh }, (_, root) => html`
		<p>
			<b>First dasy on the same data</b>
			<span>Counter: ${root.with('.form', o => o.counter)}</span>
			<button onClick="${() => root.set('.form.counter', i => i +1)}">+1</button>
		</p>
	`);

	dasy({ dataSource, container, afterRefresh }, (_, root) => html`
		<p>
			<b>Second dasy on the same data</b>
			<span>Counter: ${root.with('.form', o => o.counter)}</span>
			<button onClick="${() => root.set('.form.counter', i => i +1)}">+1</button>
		</p>
	`);
}