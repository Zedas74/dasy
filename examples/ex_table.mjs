import { dasy, html } from '../dist/dasy.mjs';

export function render(container) {
	const data = {
		rows: [
			{ cells: ['0.0', '0.1'] },
			{ cells: ['1.0', '1.1'] }
		]
	};

	// The dasy function creates a new data-bound template. The 'data' parameter is a JSON object,
	// the container is a DOM element to hold the rendered dasy DOM based on the data.
	dasy({ data, container },
	    
		// The second parameter is a function, which gets (at least) two parameters:
		// - The data root of the template (we don't need it, so it goes to a '_' variable, because it is the data itself)
		// - An interface, which provides methods to access the dasy related to the data.
		(_, root) => html`
			<table>${
				
				// The 'for' method is used to iterate over the array elements of the source.
				// The first parameter is the path inside the data object, so here it is the rows array:
				// [ { cells: ['0.0', '0.1'] }, { cells: ['1.0', '1.1'] }]
				// The 'for' will create a loop for all elements of the array.
				root.for('.rows', (_, row) =>
					
					// The first param is the row data: { cells: ['0.0', '0.1'] }, but we don't need it.
					// The second is the row context, which we use to iterate through the row data's .cells array.
					html`<tr>${row.for('.cells', (value) =>
						
						// We want the data of the cells (e.g. '1.0'), but here we don't need the context.
						html`<td>${value}</td>`

					)}</tr>`

			)}</table>
		`);
}