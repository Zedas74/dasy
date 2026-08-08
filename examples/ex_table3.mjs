import { dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		options: {
			items: [
				{ id: 0, text: 'Apple' },
				{ id: 1, text: 'Peach' },
				{ id: 2, text: 'Orange' },
				{ id: 3, text: 'Pear' },
				{ id: 4, text: 'Raspberry' }
			]
		},
		rows: [
			{ cells: [3, 1, 2] },
			{ cells: [3, 4, 0] }
		]
	};

	dasy({ data, container, afterRefresh },
		(_, root) => root.html`
			<p>
				<b>Editable list elements</b><br/>
				${root.each('.options.items', (o, { html, set }) => 
					html`<input value="${o.text}" onChange="${e => set('.text', e)}"/><br/>`)}
			</p>
			<table>${
				root.each('.rows', (_, { html, each }) =>
					html`<tr>${each('.cells', (value, { html, set }) => html`
						<td><select psValue="${value}" onChange="${e => set(e)}">${

							// This is tricky and important: we use .each() from the root, not the row!
							root.each(`.options.items`, (o, item) => new Option(o.text, o.id))
						}</select></td>
					`)}</tr>`
			)}</table>
		`);
}