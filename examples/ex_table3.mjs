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
			{ cells: [{ id: 3, count: 0 }, { id: 1, count: 0 }, { id: 2, count: 0 }] },
			{ cells: [{ id: 3, count: 0 }, { id: 4, count: 0 }, { id: 0, count: 0 }] }
		]
	};

	dasy({ data, container, afterRefresh },
		(_, root) => root.html`
			<p>
				<b>Editable item types</b><br/>
				${root.each('.options.items', (o, { html, set }) => 
					html`<input value="${o.text}" onChange="${e => set('.text', e)}"/><br/>`)}
				<button onClick="${e => { 
					data.options.items.push({ id: data.options.items.reduce((i, o) => Math.max(i, o.id +1), 0), text: 'New type' })
					root.refresh();
				}}">Add type</button>
			</p>
			<table>${
				root.each('.rows', (_, { html, each }) =>
					html`<tr>${each('.cells', (cell, { html, set }) => html`
						<td><select psValue="${cell.id}" onChange="${e => set('.id', e)}">${
							// This is tricky and important: we use .each() from the root, not the row!
							root.each(`.options.items`, (o, item) => new Option(o.text, o.id))
						}</select><input type="number" min="0" value="${cell.count}" style="width: 3em" onInput="${e => set('.count', e)}"/></td>
					`)}</tr>`
			)}</table>
			<p>${root.inspect('.rows', (rows, { html }) => html`<span>${root.each('.options.items', (item, { html }) => 
				html`<b>${item.text}</b>: ${
					rows.reduce((i, row) => i +row.cells.reduce((t, cell) => cell.id === item.id ? t +cell.count : t, 0), 0)
				}<br/>`)}</span>`
			)}</p>
		`);
}