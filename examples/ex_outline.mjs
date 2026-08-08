import { dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const data = {
		title: 'Root',
		items: [{
			title: 'First-1',
			items: []
		}, {
			title: 'First-2',
			items: [{
				title: 'Second-1',
				items: [{
					title: 'Third-1',
					items: []
				}, {
					title: 'Third-2',
					items: []
				}]
			}, {
				title: 'Second-2',
				items: []
			}]
		}]
	};

	// The template will be at most 10 levels deep.
	const renderLevel = (level, context, depth = 0) => depth >= 10 ? '' : context.html`
		<li>
			<input value="${level.title}" onChange="${e => context.set('.title', e)}" style="border: none"/><br/>
			<ul>${context.each('.items', (o, c) => renderLevel(o, c, depth +1))}</ul>
		</li>
	`;

	// Base UL element for all children.
	dasy({ data, container, afterRefresh }, (o, c) => c.html`
		<h4>You can edit the titles below…</h4>
		<ul>${renderLevel(o, c)}</ul>
	`);
}