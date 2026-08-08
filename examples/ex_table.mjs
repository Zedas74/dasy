import { dasy } from '../dist/dasy.mjs';

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
	    
		// The second parameter is a arrow function, which always receives two parameters:
		// - The data root of the template (we don't need it, because in the root, this is the data object itself, 
		//   so it goes to a '_' variable).
		// - A context interface, which provides methods to access the dasy related to the data.

		// !!!! IMPORTANT !!!!
		// You should always use the context interface's html template literal instead the included one from the dasy!
		// This version prevents memory leaks through event listeners.

		(_, root) => root.html`
			<table>${
				
				// The 'for' method is used to iterate over the array elements of the source.
				// The first parameter is the path inside the data object, so here it is the rows array:
				// [ { cells: ['0.0', '0.1'] }, { cells: ['1.0', '1.1'] }]
				// The 'for' will create a loop for all elements of the array.
				root.each('.rows', (_, row) =>
					
					// The first param is the row data: { cells: ['0.0', '0.1'] }, but we don't need it.
					// The second is the row context, which we use to iterate through the row data's .cells array.
					row.html`<tr>${row.each('.cells', (value, cell) =>
						
						// We want the data of the cells (e.g. '1.0'), but here we don't need the context.
						cell.html`<td>${value}</td>`

					)}</tr>`

			)}</table><hr/>

			<!-- Same code, but we use destructuring to access context methods -->
			<table>${
				root.each('.rows', (_, { html, each }) =>
					html`<tr>${each('.cells', (value, { html }) =>
						html`<td>${value}</td>`
					)}</tr>`
			)}</table>
		`);
}