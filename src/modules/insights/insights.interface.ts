import type {
	AttemptEventType,
	ProblemType,
	UserRole,
} from "../../../generated/prisma";

export interface ICallerInfo {
	userId: string;
	role: UserRole;
	companyId?: string | null;
}

export interface ISignalEvent {
	type: AttemptEventType;
	problemId: string | null;
	occurredAt: Date;
	chars?: number;
}

export interface IProblemSignals {
	problemId: string;
	pasteCount: number;
	pastedChars: number;
	// Time between viewing this question and moving to another one
	viewedSeconds: number;
}

export interface ISignalSummary {
	tabSwitchCount: number;
	timeAwaySeconds: number;
	longestAwaySeconds: number;
	pasteCount: number;
	pastedChars: number;
	largestPasteChars: number;
	perProblem: IProblemSignals[];
}

export interface IAnalysisProblem {
	id: string;
	title: string;
	type: ProblemType;
	points: number;
}

export interface IAnalysisAttempt {
	attemptId: string;
	candidate: { id: string; name: string; email: string };
	// null while any answer is still waiting for review
	totalScore: number | null;
	// problemId -> share of that problem's points earned (0..1)
	problemScores: Record<string, number>;
}

export interface IQuestionAnalysis {
	problemId: string;
	title: string;
	type: ProblemType;
	points: number;
	difficulty: number;
	discrimination: number;
	flag: "low-discrimination" | "very-easy" | "very-hard" | null;
}

export interface IAssessmentAnalysis {
	attemptCount: number;
	finishedCount: number;
	pendingCount: number;
	maxScore: number;
	passingScore: number;
	averagePercent: number | null;
	passRate: number | null;
	minAttemptsForAnalysis: number;
	distribution: { from: number; to: number; count: number }[];
	ranking: {
		attemptId: string;
		candidate: { id: string; name: string; email: string };
		score: number;
		percent: number;
		rank: number;
		percentile: number;
		passed: boolean;
	}[];
	questions: IQuestionAnalysis[] | null;
}
