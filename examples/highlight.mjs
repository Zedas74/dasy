export async function highlight(sText, oTarget) {
	oTarget.textContent = sText;

	const highlightAll = (sName, oRegExp, iPriority) => {
		const highlight = new Highlight();
		highlight.priority = iPriority;
		for (const oMatch of sText.matchAll(oRegExp)) {
			const range = document.createRange();
			range.setStart(oTarget.firstChild, oMatch.index);
			range.setEnd(oTarget.firstChild, oMatch.index + oMatch[0].length);
			highlight.add(range);
		}
		CSS.highlights.set(sName, highlight);
	}

	highlightAll('comment', /(\/\/.*$|<!--.*?-->)/gm, 100);
	highlightAll('dasy', /(?<!\.)\b(html(?=`)|svg(?=`)|dasy(?=\())\b/g, 80);
	highlightAll('attribute', /[-a-zA-Z_][-a-zA-Z0-9_]+(?==")/g, 70);
	highlightAll('tag', /(?:<)\/?[-_a-zA-Z0-9]+\/?>?/g, 66);
	highlightAll('operator', /([-<>(){}[\].,;:=+*/\\`]|\${)/g, 65);
	
	highlightAll('lock', /(?<c>['"]).*?[${}].*?\k<c>/gm, 11);
	highlightAll('string', /(?<c>['"]).*?\k<c>/gm, 10);
	highlightAll('number', /[0-9]+/g, 9);
	highlightAll('command', /(?<!\.)\b(import|from)\b/g, 5);
	highlightAll('keyword', /(?<!\.)\b(const|let|var|for|while|if|else|do|until|=>)\b/g, 5);
	highlightAll('function', /[a-zA-Z$_][a-zA-Z0-9$_]*(?=\()/g, 1);
}