import type { ProblemType } from "../../../generated/prisma";

// Smart assessment builder: picks problems from the bank to fill a time
// budget with a chosen mix of problem types. Pure and deterministic, no I/O.

export type DifficultyLevel = "easy" | "medium" | "hard";
export type DifficultyPreference = "easier" | "balanced" | "harder";
export type TypeMix = Record<ProblemType, number>;

export interface IBuilderProblem {
	id: string;
	title: string;
	type: ProblemType;
	points: number;
	// Seconds each candidate spent on it, from QUESTION_VIEWED events
	timeSamples: number[];
	// Share of points earned (0-1) on each graded answer
	scoreSamples: number[];
}

export interface IBuilderPick {
	problemId: string;
	title: string;
	type: ProblemType;
	points: number;
	minutes: number;
	minutesSource: "observed" | "estimate";
	timeSamples: number;
	difficulty: DifficultyLevel | null;
	averageScore: number | null;
	scoreSamples: number;
	reason: string;
}

export const PROBLEM_TYPES: ProblemType[] = ["CODING", "MCQ", "WRITTEN"];

// Below these sample sizes the bank's own data is too thin to trust
export const MIN_TIME_SAMPLES = 3;
export const MIN_SCORE_SAMPLES = 5;
// Time left unplanned for reading instructions and checking answers
export const BUFFER_SHARE = 0.1;
// How far one type may run over its share to use up whole problems
export const OVERFLOW_SHARE = 0.15;
// Same cap as the bulk attach endpoint
export const MAX_PICKS = 50;

// Fallback when nobody has timed a problem yet: a typical time for its type,
// scaled by how many points it is worth compared with a typical one.
const BASE_MINUTES: Record<ProblemType, number> = {
	MCQ: 2,
	WRITTEN: 10,
	CODING: 20,
};
const TYPICAL_POINTS: Record<ProblemType, number> = {
	MCQ: 5,
	WRITTEN: 15,
	CODING: 20,
};

const clamp = (n: number, min: number, max: number) =>
	Math.min(max, Math.max(min, n));

export const estimateMinutes = (type: ProblemType, points: number) =>
	Math.max(
		1,
		Math.round(
			BASE_MINUTES[type] * clamp(points / TYPICAL_POINTS[type], 0.5, 2),
		),
	);

export const median = (values: number[]) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const difficultyOf = (averageScore: number): DifficultyLevel =>
	averageScore >= 0.7 ? "easy" : averageScore >= 0.4 ? "medium" : "hard";

const TYPE_NAME: Record<ProblemType, string> = {
	CODING: "coding",
	MCQ: "multiple choice",
	WRITTEN: "written",
};

// How much a problem is worth picking, beyond the minutes it fills.
// Rated problems that match the preference win, and timed problems beat
// guessed ones because the plan is more likely to hold.
const PREFERENCE_SCORE: Record<
	DifficultyPreference,
	Record<DifficultyLevel | "unrated", number>
> = {
	balanced: { medium: 3, easy: 2, hard: 2, unrated: 1.5 },
	easier: { easy: 3, medium: 2, unrated: 1.5, hard: 0.5 },
	harder: { hard: 3, medium: 2, unrated: 1.5, easy: 0.5 },
};

export const describe = (problem: IBuilderProblem): IBuilderPick => {
	const timed = problem.timeSamples.filter((s) => s >= 10);
	const observed = timed.length >= MIN_TIME_SAMPLES;
	const minutes = observed
		? Math.max(1, Math.round(median(timed) / 60))
		: estimateMinutes(problem.type, problem.points);

	const rated = problem.scoreSamples.length >= MIN_SCORE_SAMPLES;
	const averageScore = rated
		? problem.scoreSamples.reduce((a, b) => a + b, 0) /
			problem.scoreSamples.length
		: null;
	const difficulty = averageScore === null ? null : difficultyOf(averageScore);

	const timePart = observed
		? `Candidates took about ${minutes} min (median of ${timed.length})`
		: `Estimated ${minutes} min for a ${problem.points}-point ${TYPE_NAME[problem.type]} problem`;
	const scorePart =
		averageScore === null
			? "not enough graded answers to rate difficulty yet"
			: `${Math.round(averageScore * 100)}% average score across ${problem.scoreSamples.length} answers`;

	return {
		problemId: problem.id,
		title: problem.title,
		type: problem.type,
		points: problem.points,
		minutes,
		minutesSource: observed ? "observed" : "estimate",
		timeSamples: timed.length,
		difficulty,
		averageScore:
			averageScore === null ? null : Math.round(averageScore * 100) / 100,
		scoreSamples: problem.scoreSamples.length,
		reason: `${timePart}; ${scorePart}.`,
	};
};

const preferenceValue = (
	pick: IBuilderPick,
	preference: DifficultyPreference,
) =>
	PREFERENCE_SCORE[preference][pick.difficulty ?? "unrated"] +
	(pick.minutesSource === "observed" ? 0.5 : 0);

// 0/1 knapsack over whole minutes. Filling the budget comes first (each
// minute is worth far more than any preference score), so the plan lands as
// close to the target as the bank allows, then the preference decides
// between equally full plans. Ties keep the input order, which is stable.
const fill = (
	items: IBuilderPick[],
	budget: number,
	preference: DifficultyPreference,
	maxCount: number,
) => {
	const capacity = Math.max(0, Math.floor(budget));
	if (capacity === 0 || items.length === 0 || maxCount === 0) return [];

	const MINUTE_WEIGHT = 1000;
	const best = new Array<number>(capacity + 1).fill(0);
	const count = new Array<number>(capacity + 1).fill(0);
	const choice: boolean[][] = items.map(() =>
		new Array<boolean>(capacity + 1).fill(false),
	);

	items.forEach((item, i) => {
		const value =
			item.minutes * MINUTE_WEIGHT + preferenceValue(item, preference);
		for (let c = capacity; c >= item.minutes; c--) {
			const candidate = best[c - item.minutes] + value;
			if (candidate > best[c] && count[c - item.minutes] < maxCount) {
				best[c] = candidate;
				count[c] = count[c - item.minutes] + 1;
				choice[i][c] = true;
			}
		}
	});

	const picked: IBuilderPick[] = [];
	let c = capacity;
	for (let i = items.length - 1; i >= 0 && c > 0; i--) {
		if (choice[i][c]) {
			picked.push(items[i]);
			c -= items[i].minutes;
		}
	}
	return picked.reverse();
};

export interface IBuildPlanInput {
	pool: IBuilderProblem[];
	budgetMinutes: number;
	mix: TypeMix;
	preference: DifficultyPreference;
	maxPicks?: number;
}

export const buildPlan = ({
	pool,
	budgetMinutes,
	mix,
	preference,
	maxPicks = MAX_PICKS,
}: IBuildPlanInput) => {
	const described = pool.map(describe);
	const totalMix = PROBLEM_TYPES.reduce((sum, t) => sum + mix[t], 0);

	const picks: IBuilderPick[] = [];
	const notes: string[] = [];
	// Problems come in fixed sizes, so a type rarely fills its share exactly.
	// Types go largest share first. Each may run over its share by a little,
	// and minutes one type leaves unused carry over to the next.
	const order = [...PROBLEM_TYPES].sort((a, b) => mix[b] - mix[a]);
	let carry = 0;
	let remaining = Math.max(0, Math.floor(budgetMinutes));
	const results = new Map<
		ProblemType,
		{ targetMinutes: number; minutes: number; count: number }
	>();

	for (const type of order) {
		const share = totalMix > 0 ? mix[type] / totalMix : 0;
		const targetMinutes = Math.round(budgetMinutes * share);
		const available = described.filter((p) => p.type === type);
		const allowance =
			targetMinutes > 0
				? Math.min(
						remaining,
						Math.round(
							Math.max(0, targetMinutes + carry) * (1 + OVERFLOW_SHARE),
						),
					)
				: 0;
		const chosen = fill(
			available,
			allowance,
			preference,
			maxPicks - picks.length,
		);
		picks.push(...chosen);

		const minutes = chosen.reduce((sum, p) => sum + p.minutes, 0);
		remaining -= minutes;
		if (targetMinutes > 0) carry = targetMinutes + carry - minutes;

		if (targetMinutes > 0 && available.length === 0) {
			notes.push(
				`There are no ${TYPE_NAME[type]} problems left in your bank to add.`,
			);
		} else if (targetMinutes > 0 && minutes < targetMinutes * 0.8) {
			notes.push(
				`Only ${minutes} of ${targetMinutes} planned minutes of ${TYPE_NAME[type]} problems could be filled. Add more to the bank, or change the mix.`,
			);
		}
		results.set(type, { targetMinutes, minutes, count: chosen.length });
	}

	// Report in the usual coding, MCQ, written order
	const byType = PROBLEM_TYPES.map((type) => ({
		type,
		...(results.get(type) ?? { targetMinutes: 0, minutes: 0, count: 0 }),
	}));

	const estimated = picks.filter((p) => p.minutesSource === "estimate").length;
	if (picks.length > 0 && estimated > 0) {
		notes.push(
			`${estimated} of ${picks.length} times are estimates. They're replaced by real timings once ${MIN_TIME_SAMPLES} candidates have answered a problem.`,
		);
	}

	return {
		picks,
		byType,
		totalMinutes: picks.reduce((sum, p) => sum + p.minutes, 0),
		totalPoints: picks.reduce((sum, p) => sum + p.points, 0),
		notes,
	};
};
