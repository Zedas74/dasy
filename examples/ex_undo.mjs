import { html, dasy, JSONUndoBuffer } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		form: {
			text: 'Test',
			num: 9,
			check: true
		}
	}

	// The JSONUndoBuffer can record data snapshots.
	const undoBuffer = new JSONUndoBuffer(data);

	dasy({ data, container, afterRefresh }, (_, root) => html`
		<div>
			<div class="form2col">
				<span>Text:</span> <input value="${root.with('.form', $ => $.text)}" onChange="${e => {
					root.set('.form.text', e); undoBuffer.snapshot();
				}}"/>

				<span>Checkbox:</span> <input type="checkbox" checked="${
					// This is a trick: the dasy will remove the 'checked' attribute, if the value is null or undefined.
					root.with('.form', $ => $.check ? true : null)
				}" onChange="${e => {
					root.set('.form.check', e.target.checked); undoBuffer.snapshot();
				}}"/>
			
				<span>Number:</span> <input value="${root.with('.form', $ => $.num)}" inputMode="numeric" 
					pattern="\\d+" onChange="${e => {
					root.set('.form.num', e.target.value); undoBuffer.snapshot();
				}}"/>
			</div>
			<hr/>
			<p>
				<button onClick="${() => { undoBuffer.undo(); root.refresh(); }}">Undo</button>
				<button onClick="${() => { undoBuffer.redo(); root.refresh(); }}">Redo</button>
			</p>
		</div>
	`);
}