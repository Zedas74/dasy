import { html, dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	let output;
	const pages = [];
	
	const createPage = () => {
		const data = { form: { counter: 1 } };
		const container = output.appendChild(document.createElement('div'));

		// Store the new dasy instance in an array as `syndInstance`.
		pages.push({ container, syndInstance: dasy({ data, container, afterRefresh }, (_, root) => root.html`
			<p>
				<span>Counter: ${root.use('.form', o => o.counter)}</span>
				<button onClick="${() => root.set('.form.counter', i => i +1)}">+1</button>
			</p>
		`) });
	};

	const destroyPage = () => {
		const { container, syndInstance } = pages.pop() ?? {};

		// All dasy instances have a .disconnect() method, which removes all allocated elements.
		syndInstance?.disconnect();
		container?.remove();
	}

	container.append(html`
		<div>${parent => {

			// This just stores this div in the 'output' variable.
			output = parent; 
			return ''; 
		}}</div>
		<button onClick="${createPage}">New dasy</button>
		<button onClick="${destroyPage}">Destroy last dasy</button>
	`);
}