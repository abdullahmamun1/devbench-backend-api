import type {
	IAnalysisAttempt,
	IAnalysisProblem,
	IAssessmentAnalysis,
	IProblemSignals,
	IQuestionAnalysis,
	ISignalEvent,
	ISignalSummary,
} from "./insights.interface";

const seconds = (ms: number) => Math.max(0, Math.round(ms / 1000));

// Turns the raw event log of one attempt into evaluator-facing numbers.
// `endAt` closes anything still open: a tab hidden at the end, or the last
// question viewed.
const summarizeSignals = (
	events: ISignalEvent[],
	endAt: Date,
): ISignalSummary => {
	const sorted = [...events].sort(
		(a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
	);

	const perProblem = new Map<string, IProblemSignals>();
	const problem = (id: string) => {
		let entry = perProblem.get(id);
		if (!entry) {
			entry = {
				problemId: id,
				pasteCount: 0,
				pastedChars: 0,
				viewedSeconds: 0,
			};
			perProblem.set(id, entry);
		}
		return entry;
	};

	let tabSwitchCount = 0;
	let awayMs = 0;
	let longestAwayMs = 0;
	let hiddenAt: Date | null = null;

	let pasteCount = 0;
	let pastedChars = 0;
	let largestPasteChars = 0;

	let viewing: { problemId: string; since: Date } | null = null;

	const closeAway = (at: Date) => {
		if (!hiddenAt) return;
		const gap = at.getTime() - hiddenAt.getTime();
		awayMs += gap;
		longestAwayMs = Math.max(longestAwayMs, gap);
		hiddenAt = null;
	};

	const closeView = (at: Date) => {
		if (!viewing) return;
		problem(viewing.problemId).viewedSeconds += seconds(
			at.getTime() - viewing.since.getTime(),
		);
		viewing = null;
	};

	for (const event of sorted) {
		switch (event.type) {
			case "TAB_HIDDEN":
				// Repeated HIDDEN without VISIBLE counts once
				if (!hiddenAt) {
					tabSwitchCount++;
					hiddenAt = event.occurredAt;
				}
				break;
			case "TAB_VISIBLE":
				closeAway(event.occurredAt);
				break;
			case "PASTE": {
				const chars = event.chars ?? 0;
				pasteCount++;
				pastedChars += chars;
				largestPasteChars = Math.max(largestPasteChars, chars);
				if (event.problemId) {
					const entry = problem(event.problemId);
					entry.pasteCount++;
					entry.pastedChars += chars;
				}
				break;
			}
			case "QUESTION_VIEWED":
				closeView(event.occurredAt);
				if (event.problemId) {
					viewing = { problemId: event.problemId, since: event.occurredAt };
				}
				break;
		}
	}

	closeAway(endAt);
	closeView(endAt);

	return {
		tabSwitchCount,
		timeAwaySeconds: seconds(awayMs),
		longestAwaySeconds: seconds(longestAwayMs),
		pasteCount,
		pastedChars,
		largestPasteChars,
		perProblem: [...perProblem.values()],
	};
};

// Item analysis needs a handful of finished attempts to mean anything
export const MIN_ATTEMPTS_FOR_ANALYSIS = 5;

const mean = (values: number[]) =>
	values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

const round = (n: number, places = 2) => {
	const f = 10 ** places;
	return Math.round(n * f) / f;
};

// Ranks finished attempts, builds the score histogram and, once there are
// enough attempts, runs classic item analysis on every question:
// - difficulty (p): the average share of points candidates earned
// - discrimination (D): how much better the top 27% did than the bottom 27%.
//   Near zero or negative means the question doesn't separate strong from
//   weak candidates.
const analyzeAssessment = (
	problems: IAnalysisProblem[],
	attempts: IAnalysisAttempt[],
	passingScore: number,
): IAssessmentAnalysis => {
	const maxScore = problems.reduce((sum, p) => sum + p.points, 0);
	const finished = attempts.filter((a) => a.totalScore !== null);
	const pendingCount = attempts.length - finished.length;

	const percentOf = (a: IAnalysisAttempt) =>
		maxScore > 0 ? (a.totalScore ?? 0) / maxScore : 0;

	const sorted = [...finished].sort(
		(a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0),
	);

	// Ties share a rank (1, 2, 2, 4). Percentile = share of others you beat.
	const ranking = sorted.map((attempt) => {
		const score = attempt.totalScore ?? 0;
		const above = sorted.filter((o) => (o.totalScore ?? 0) > score).length;
		const below = sorted.filter((o) => (o.totalScore ?? 0) < score).length;
		return {
			attemptId: attempt.attemptId,
			candidate: attempt.candidate,
			score,
			percent: round(percentOf(attempt) * 100, 1),
			rank: above + 1,
			percentile:
				sorted.length > 1
					? Math.round((below / (sorted.length - 1)) * 100)
					: 100,
			passed: score >= passingScore,
		};
	});

	// Ten buckets: 0-9%, 10-19% ... 90-100%
	const distribution = Array.from({ length: 10 }, (_, i) => ({
		from: i * 10,
		to: i === 9 ? 100 : i * 10 + 9,
		count: 0,
	}));
	for (const attempt of finished) {
		const bucket = Math.min(9, Math.floor(percentOf(attempt) * 10));
		distribution[bucket].count++;
	}

	let questions: IQuestionAnalysis[] | null = null;
	if (finished.length >= MIN_ATTEMPTS_FOR_ANALYSIS) {
		const groupSize = Math.max(1, Math.round(sorted.length * 0.27));
		const top = sorted.slice(0, groupSize);
		const bottom = sorted.slice(-groupSize);
		const itemScore = (a: IAnalysisAttempt, problemId: string) =>
			a.problemScores[problemId] ?? 0;

		questions = problems.map((problem) => {
			const difficulty = mean(finished.map((a) => itemScore(a, problem.id)));
			const discrimination =
				mean(top.map((a) => itemScore(a, problem.id))) -
				mean(bottom.map((a) => itemScore(a, problem.id)));

			let flag: IQuestionAnalysis["flag"] = null;
			if (discrimination < 0.2) flag = "low-discrimination";
			else if (difficulty > 0.9) flag = "very-easy";
			else if (difficulty < 0.2) flag = "very-hard";

			return {
				problemId: problem.id,
				title: problem.title,
				type: problem.type,
				points: problem.points,
				difficulty: round(difficulty),
				discrimination: round(discrimination),
				flag,
			};
		});
	}

	const passedCount = ranking.filter((r) => r.passed).length;

	return {
		attemptCount: attempts.length,
		finishedCount: finished.length,
		pendingCount,
		maxScore,
		passingScore,
		averagePercent: finished.length
			? round(mean(finished.map(percentOf)) * 100, 1)
			: null,
		passRate: finished.length
			? round((passedCount / finished.length) * 100, 1)
			: null,
		minAttemptsForAnalysis: MIN_ATTEMPTS_FOR_ANALYSIS,
		distribution,
		ranking,
		questions,
	};
};

export const insightsUtil = {
	summarizeSignals,
	analyzeAssessment,
};
