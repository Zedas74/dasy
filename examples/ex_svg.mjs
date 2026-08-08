import { dasy } from '../dist/dasy.mjs';

export function render(container, afterRefresh) {
	const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
	const pieRadius = 50;
	const pieCircumference = 2 * Math.PI * pieRadius;

	const data = {
		chart: {
			value: 42,
		},
	}

	dasy({ data, container, afterRefresh }, (_, root) => root.html`
		<div>
			<input type="range" min="0" max="100" value="${
				root.use('.chart', $ => $.value)}" onInput="${e => root.set('.chart.value', e)}" />

			<div style="width: 180px; margin-top: 0.75rem">${root.svg`

				<!-- This DOM part created with SVG namespace -->
				<svg viewBox="0 0 120 120" width="180" height="180" role="img" aria-label="Pie chart">
					<circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" stroke-width="18"></circle>
					<circle cx="60" cy="60" r="50" fill="none" stroke="#2563eb" stroke-width="18" 
						stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${
						root.use('.chart', $ => `${(clamp($.value) / 100) *pieCircumference} ${pieCircumference}`)}"></circle>
					<text x="60" y="60" text-anchor="middle" dominant-baseline="middle" style="fill: #111827">${
						root.use('.chart', $ => `${clamp($.value)}%`)}</text>
				</svg>

			`}</div>
		</div>
	`);
}