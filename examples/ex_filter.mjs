import { html, dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const books = [
		{ title: 'To Kill a Mockingbird', author: 'Harper Lee', genre: 'Fiction' },
		{ title: '1984', author: 'George Orwell', genre: 'Dystopian' },
		{ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', genre: 'Classic' },
		{ title: 'Pride and Prejudice', author: 'Jane Austen', genre: 'Romance' },
		{ title: 'The Hobbit', author: 'J.R.R. Tolkien', genre: 'Fantasy' },
		{ title: 'Fahrenheit 451', author: 'Ray Bradbury', genre: 'Science Fiction' },
		{ title: 'Moby-Dick', author: 'Herman Melville', genre: 'Adventure' },
		{ title: 'War and Peace', author: 'Leo Tolstoy', genre: 'Historical Fiction' },
		{ title: 'The Catcher in the Rye', author: 'J.D. Salinger', genre: 'Realistic Fiction' },
		{ title: 'Crime and Punishment', author: 'Fyodor Dostoevsky', genre: 'Philosophical Fiction' }
	];

	const data = {
		sources: {
			books: [],
		},
		form: {
			filter: '',
			orderAsc: true
		}
	}

	// We could say this is a control…
	const renderBook = (book, { html }) => html`
		<div class="book">
			Title: <b>${book.title}</b><br/>
			Author: <b>${book.author}</b><br/>
			Genre: <b>${book.genre}</b><br/>
		</div>`;

	// Execute filtering and ordering by the form values
	const filterBooks = () =>
		data.sources.books = books.filter(o => o.genre.includes(data.form.filter)).toSorted((a, b) => 
			data.form.orderAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));

	// Initialize the books array in the data.
	filterBooks();

	// `beforeRefresh` is called after the dasy's `refresh()` method is called. `root.set()` automatically calls
	// refresh, so the book array in the data will also be refreshed. dasy will calculate the
	// necessary DOM changes after `beforeRefresh` returns.
	// (`afterRefresh` is used by the example page to show the data's JSON view.)
	dasy({ data, container, beforeRefresh: filterBooks, afterRefresh }, (_, { html, set, each }) => html`
		<p>Genre filter: 
			<input onInput="${e => set('.form.filter', e)}" placeholder="Filter genre…"/> 
			<button onClick="${() => set('.form.orderAsc', true)}">A-Z</button>
			<button onClick="${() => set('.form.orderAsc', false)}">Z-A</button>
		</p>
		<div class="books">${each('.sources.books', 
			(book, bookRoot) => renderBook(book, bookRoot), 
			
			// There is an optional secondary template for the .each() method which is applied when the
			// array is empty.
			(_, emptyRoot) => emptyRoot.html`<p>No books found.</p>`)}</div>
	`);
}