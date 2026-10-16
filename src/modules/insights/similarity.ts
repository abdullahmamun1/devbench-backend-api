// Code and text similarity by winnowing (Schleimer, Wilkerson and Aiken,
// "Winnowing: local algorithms for document fingerprinting", SIGMOD 2003),
// the technique behind Stanford's MOSS plagiarism detector.
//
// 1. Tokenise and normalise, so renaming variables, reformatting or editing
//    comments doesn't hide a copy.
// 2. Hash every run of K consecutive tokens (a k-gram).
// 3. Slide a window of W hashes and keep the smallest in each window. Any
//    shared run of at least W + K - 1 tokens is then guaranteed to produce a
//    shared fingerprint.
// 4. Similarity = shared fingerprints / fingerprints of the smaller document.
// 5. Optionally ignore "common code": fingerprints that several submissions to
//    the problem share (the textbook solution, boilerplate input parsing).
//    Like MOSS, only uncommon shared code counts as evidence.
//
// This file has no imports so it runs unchanged in the API and in the browser.
// KEEP IN SYNC: the frontend has an identical copy at src/lib/similarity.ts.

export type SimilarityMode = "code" | "text";

interface Token {
	value: string;
	line: number;
}

interface Fingerprint {
	hash: number;
	// Index of the first token of the k-gram this fingerprint came from
	start: number;
}

export interface LineRange {
	from: number;
	to: number;
}

export interface SimilarityResult {
	// 0..1, relative to the smaller of the two documents
	score: number;
	// Matching lines (1-based, inclusive) in each document
	matchesA: LineRange[];
	matchesB: LineRange[];
	// False when either document is too short to judge
	comparable: boolean;
	// True when the documents only share code that most submissions contain
	commonOnly: boolean;
}

// Below this many uncommon fingerprints a document has too little of its own
// to compare once common code is set aside
const MIN_DISTINCT_FINGERPRINTS = 5;

// minTokens: below this, short or standard answers match naturally, so the
// pair is reported as too short to judge instead of being scored
const SETTINGS: Record<
	SimilarityMode,
	{ k: number; w: number; minTokens: number }
> = {
	code: { k: 5, w: 4, minTokens: 25 },
	text: { k: 4, w: 4, minTokens: 15 },
};

// Keywords and common built-ins across the languages the exam editor offers
// (JavaScript, TypeScript, Python, Java, C, C++, C#, Go). They keep their
// identity; every other identifier becomes "id".
const KEYWORDS = new Set(
	`abstract and as async await bool boolean break byte case catch char class
  const continue def default defer del delete do double elif else enum export
  extends false final finally float for foreach from func function go goto if
  implements import in instanceof int interface is lambda let long map new nil
  none not null or package pass print private protected public raise range
  return self short static string struct super switch this throw throws true
  try type typeof undefined using var void while with yield len push pop
  append length size println printf console log`
		.split(/\s+/)
		.filter(Boolean),
);

const STOP_WORDS = new Set(
	`a an the and or but if then so of to in on at by for with from as is are
  was were be been being it its this that these those there their they them we
  you your i me my our he she his her not no do does did can could will would
  should may might must have has had which who whom what when where why how
  also into than too very just about over such only`
		.split(/\s+/)
		.filter(Boolean),
);

function tokenizeCode(source: string): Token[] {
	const tokens: Token[] = [];
	// Order matters: comments and strings before operators
	const pattern =
		/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d[\d_.]*\w*\b|[A-Za-z_$][\w$]*|==={0,1}|!==?|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|=>|->|::|[{}()[\];,.:?<>+\-*/%=!&|^~]/g;
	// Line numbers are tracked incrementally: re-scanning from the start for
	// every token would be quadratic on a long submission
	let line = 1;
	let scanned = 0;
	let match: RegExpExecArray | null = pattern.exec(source);
	while (match !== null) {
		const raw = match[0];
		for (let i = scanned; i < match.index; i++) {
			if (source.charCodeAt(i) === 10) line++;
		}
		scanned = match.index;
		const first = raw[0];
		if (raw.startsWith("//") || raw.startsWith("/*") || first === "#") {
			// comment: dropped
		} else if (first === '"' || first === "'" || first === "`") {
			tokens.push({ value: "str", line });
		} else if (/\d/.test(first)) {
			tokens.push({ value: "num", line });
		} else if (/[A-Za-z_$]/.test(first)) {
			const word = raw.toLowerCase();
			tokens.push({ value: KEYWORDS.has(word) ? word : "id", line });
		} else {
			tokens.push({ value: raw, line });
		}
		match = pattern.exec(source);
	}
	return tokens;
}

function tokenizeText(source: string): Token[] {
	const tokens: Token[] = [];
	const lines = source.split("\n");
	lines.forEach((text, i) => {
		for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
			if (!STOP_WORDS.has(word)) tokens.push({ value: word, line: i + 1 });
		}
	});
	return tokens;
}

export function tokenize(source: string, mode: SimilarityMode): Token[] {
	return mode === "code" ? tokenizeCode(source) : tokenizeText(source);
}

// 32-bit FNV-1a: small, fast and stable across runtimes
function hashString(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function fingerprints(
	tokens: Token[],
	k: number,
	w: number,
): Fingerprint[] {
	if (tokens.length < k) return [];
	const grams: number[] = [];
	for (let i = 0; i + k <= tokens.length; i++) {
		grams.push(
			hashString(
				tokens
					.slice(i, i + k)
					.map((t) => t.value)
					.join("\u0001"),
			),
		);
	}

	// Short documents: keep every k-gram so they still compare
	if (grams.length <= w) {
		return grams.map((hash, start) => ({ hash, start }));
	}

	const picked: Fingerprint[] = [];
	let last = -1;
	for (let i = 0; i + w <= grams.length; i++) {
		// Rightmost minimum in the window, as in the paper
		let min = i;
		for (let j = i + 1; j < i + w; j++) {
			if (grams[j] <= grams[min]) min = j;
		}
		if (min !== last) {
			picked.push({ hash: grams[min], start: min });
			last = min;
		}
	}
	return picked;
}

function toRanges(lines: Set<number>): LineRange[] {
	const sorted = [...lines].sort((a, b) => a - b);
	const ranges: LineRange[] = [];
	for (const line of sorted) {
		const prev = ranges[ranges.length - 1];
		if (prev && line <= prev.to + 1) prev.to = line;
		else ranges.push({ from: line, to: line });
	}
	return ranges;
}

// The set of fingerprint hashes for one document, used to find common code
export function fingerprintSet(
	source: string,
	mode: SimilarityMode = "code",
): Set<number> {
	const { k, w } = SETTINGS[mode];
	return new Set(fingerprints(tokenize(source, mode), k, w).map((f) => f.hash));
}

// Hashes shared by enough documents to count as common ground rather than
// evidence: at least `minCount` documents, or `share` of them on large pools.
// A pair copying from each other stays visible; the textbook answer that
// several candidates wrote independently does not.
export function commonFingerprints(
	sets: Set<number>[],
	share = 0.3,
	minCount = 3,
	minDocuments = 5,
): Set<number> {
	const common = new Set<number>();
	if (sets.length < minDocuments) return common;
	const threshold = Math.max(minCount, Math.ceil(share * sets.length));
	const counts = new Map<number, number>();
	for (const set of sets) {
		for (const hash of set) counts.set(hash, (counts.get(hash) ?? 0) + 1);
	}
	for (const [hash, count] of counts) {
		if (count >= threshold) common.add(hash);
	}
	return common;
}

export function compare(
	a: string,
	b: string,
	mode: SimilarityMode = "code",
	ignore: Set<number> = new Set(),
): SimilarityResult {
	const { k, w, minTokens } = SETTINGS[mode];
	const tokensA = tokenize(a, mode);
	const tokensB = tokenize(b, mode);
	const fpA = fingerprints(tokensA, k, w);
	const fpB = fingerprints(tokensB, k, w);

	if (
		tokensA.length < minTokens ||
		tokensB.length < minTokens ||
		fpA.length === 0 ||
		fpB.length === 0
	) {
		return {
			score: 0,
			matchesA: [],
			matchesB: [],
			comparable: false,
			commonOnly: false,
		};
	}

	const hashesA = new Set(fpA.map((f) => f.hash).filter((h) => !ignore.has(h)));
	const hashesB = new Set(fpB.map((f) => f.hash).filter((h) => !ignore.has(h)));
	if (
		ignore.size > 0 &&
		(hashesA.size < MIN_DISTINCT_FINGERPRINTS ||
			hashesB.size < MIN_DISTINCT_FINGERPRINTS)
	) {
		// Everything distinctive is common code: nothing here points to copying
		return {
			score: 0,
			matchesA: [],
			matchesB: [],
			comparable: true,
			commonOnly: true,
		};
	}
	let shared = 0;
	for (const hash of hashesA) if (hashesB.has(hash)) shared++;
	const score = shared / Math.min(hashesA.size, hashesB.size);

	const linesOf = (fps: Fingerprint[], tokens: Token[], other: Set<number>) => {
		const lines = new Set<number>();
		for (const fp of fps) {
			if (!other.has(fp.hash)) continue;
			for (let i = fp.start; i < fp.start + k && i < tokens.length; i++) {
				lines.add(tokens[i].line);
			}
		}
		return toRanges(lines);
	};

	return {
		score: Math.min(1, score),
		matchesA: linesOf(fpA, tokensA, hashesB),
		matchesB: linesOf(fpB, tokensB, hashesA),
		comparable: true,
		commonOnly: false,
	};
}

// Shared thresholds so the API, the evaluator panel and the demo agree
export function similarityLevel(score: number): "high" | "review" | "low" {
	if (score >= 0.7) return "high";
	if (score >= 0.4) return "review";
	return "low";
}
