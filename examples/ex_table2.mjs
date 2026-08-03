import { dasy, html } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		grid: [
			['0.0', '0.1'],
			['1.0', '1.1'],
		],
	}

	// (The afterRefresh used by the example page to show the data's JSON view.)
	dasy({ data, container, afterRefresh }, (_, root) => html`
		<div>
			<p>This example shows the power and simplicity of dasy<br/>by creating an <b>editable</b>, resizable grid.</p>
			<hr/>
			<p>
				<button onClick="${() => {
					
					// Clone the first row
					data.grid.push(data.grid[0]?.map((_, i) => `${data.grid.length}.${i}`) ?? ['0.0']); root.refresh();
				}}">Add row</button>
				<button onClick="${() => { 
					data.grid.pop(); root.refresh();
				}}">Del row</button>
				<button onClick="${() => { 
					data.grid.shift(); root.refresh(); 
				}}">Del first row</button>
			</p>
			<p>
				<button onClick="${() => { 
					data.grid.forEach((a, i) => a.push(`${i}.${a.length}`)); root.refresh(); 
				}}">Add col</button>
				<button onClick="${() => { 
					data.grid.forEach((a, i) => a.pop()); root.refresh(); 
				}}">Del col</button>
				<button onClick="${() => { 
					data.grid.forEach((a, i) => a.shift()); root.refresh(); 
				}}">Del first col</button>
			</p>
			<p>
				<!-- If an element rebuilt by the refresh, the color will be removed -->

				<button onClick="${e => e.target.closest('div').querySelectorAll('input')
					.forEach(o => o.style.color = 'red')}">Colorize DOM to show changes</button>
			</p>
			<hr/><br/>
			<table>${
				root.for('.grid', (_, row) => html`<tr>${
					row.for((value, cell) => html`<td><input value="${value}" onChange="${cell.set}"/></td>`)
				}</tr>`)
			}</table><br/>
		</div>
	`);
}