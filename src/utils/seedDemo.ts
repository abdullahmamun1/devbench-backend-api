import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "../../generated/prisma/client";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { seedAllRoles } from "./seed.js";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const DEMO_PASSWORD = "Demo@1234";
const DEMO_SUFFIX = ".example"; // every demo-only email ends with this
const DEMO_COMPANIES = ["Globex Labs", "Initech Ltd"];
const RESET = process.argv.includes("--reset");

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const earlier = (d: Date) => (d.getTime() > Date.now() ? new Date() : d);

const must = <T>(value: T | null | undefined, message: string): T => {
	if (value === null || value === undefined) throw new Error(message);
	return value;
};

// ---------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------
interface McqSeed {
	key: string;
	type: "MCQ";
	title: string;
	description: string;
	points: number;
	options: { text: string; isCorrect: boolean }[];
}
interface CodingSeed {
	key: string;
	type: "CODING";
	title: string;
	description: string;
	points: number;
	testCases: {
		input: string;
		expectedOutput: string;
		isHidden: boolean;
		weight: number;
	}[];
	sampleCode: string;
}
interface WrittenSeed {
	key: string;
	type: "WRITTEN";
	title: string;
	description: string;
	points: number;
	sampleAnswer: string;
}
type ProblemSeed = McqSeed | CodingSeed | WrittenSeed;

const ACME_PROBLEMS: ProblemSeed[] = [
	{
		key: "typeof-null",
		type: "MCQ",
		title: "JavaScript: typeof null",
		description: "What does `typeof null` return in JavaScript?",
		points: 5,
		options: [
			{ text: '"object"', isCorrect: true },
			{ text: '"null"', isCorrect: false },
			{ text: '"undefined"', isCorrect: false },
			{ text: '"number"', isCorrect: false },
		],
	},
	{
		key: "box-model",
		type: "MCQ",
		title: "CSS: spacing outside the border",
		description:
			"Which CSS property adds space outside an element's border, between it and its neighbours?",
		points: 5,
		options: [
			{ text: "margin", isCorrect: true },
			{ text: "padding", isCorrect: false },
			{ text: "outline", isCorrect: false },
			{ text: "border-spacing", isCorrect: false },
		],
	},
	{
		key: "http-201",
		type: "MCQ",
		title: "HTTP status for a created resource",
		description:
			"A POST request successfully creates a new resource. Which status code fits best?",
		points: 5,
		options: [
			{ text: "201 Created", isCorrect: true },
			{ text: "200 OK", isCorrect: false },
			{ text: "204 No Content", isCorrect: false },
			{ text: "302 Found", isCorrect: false },
		],
	},
	{
		key: "use-effect",
		type: "MCQ",
		title: "React: what useEffect is for",
		description: "What is the main purpose of the useEffect hook?",
		points: 10,
		options: [
			{ text: "Run side effects after render", isCorrect: true },
			{ text: "Store state between renders", isCorrect: false },
			{ text: "Memoize an expensive calculation", isCorrect: false },
			{ text: "Create a ref to a DOM node", isCorrect: false },
		],
	},
	{
		key: "sql-distinct",
		type: "MCQ",
		title: "SQL: removing duplicate rows",
		description:
			"Which keyword removes duplicate rows from the result of a SELECT query?",
		points: 10,
		options: [
			{ text: "DISTINCT", isCorrect: true },
			{ text: "UNIQUE", isCorrect: false },
			{ text: "GROUP", isCorrect: false },
			{ text: "ONLY", isCorrect: false },
		],
	},
	{
		key: "reverse-string",
		type: "CODING",
		title: "Reverse a string",
		description:
			"Read a single line from standard input and print it reversed.\n\nExample: `hello` prints `olleh`.",
		points: 15,
		testCases: [
			{ input: "hello", expectedOutput: "olleh", isHidden: false, weight: 1 },
			{
				input: "DevBench",
				expectedOutput: "hcneBveD",
				isHidden: false,
				weight: 1,
			},
			{ input: "a", expectedOutput: "a", isHidden: true, weight: 1 },
		],
		sampleCode:
			'const input = require("fs").readFileSync(0, "utf8").trim();\nconsole.log(input.split("").reverse().join(""));',
	},
	{
		key: "two-sum",
		type: "CODING",
		title: "Two Sum",
		description:
			"The first line is a JSON array of integers, the second line is the target. Print the indices of the two numbers that add up to the target as a JSON array.\n\nExample: `[2,7,11,15]` and `9` prints `[0,1]`.",
		points: 20,
		testCases: [
			{
				input: "[2,7,11,15]\n9",
				expectedOutput: "[0,1]",
				isHidden: false,
				weight: 1,
			},
			{
				input: "[3,2,4]\n6",
				expectedOutput: "[1,2]",
				isHidden: false,
				weight: 1,
			},
			{ input: "[3,3]\n6", expectedOutput: "[0,1]", isHidden: true, weight: 2 },
		],
		sampleCode:
			'const [numsLine, targetLine] = require("fs").readFileSync(0, "utf8").trim().split("\\n");\nconst nums = JSON.parse(numsLine);\nconst target = Number(targetLine);\nconst seen = new Map();\nfor (let i = 0; i < nums.length; i++) {\n  if (seen.has(target - nums[i])) {\n    console.log(JSON.stringify([seen.get(target - nums[i]), i]));\n    break;\n  }\n  seen.set(nums[i], i);\n}',
	},
	{
		key: "fizzbuzz",
		type: "CODING",
		title: "FizzBuzz up to N",
		description:
			"Read an integer N. For each number from 1 to N print Fizz if it is divisible by 3, Buzz if divisible by 5, FizzBuzz if both, otherwise the number.",
		points: 15,
		testCases: [
			{
				input: "5",
				expectedOutput: "1\n2\nFizz\n4\nBuzz",
				isHidden: false,
				weight: 1,
			},
			{
				input: "15",
				expectedOutput:
					"1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz",
				isHidden: true,
				weight: 2,
			},
		],
		sampleCode:
			'const n = Number(require("fs").readFileSync(0, "utf8").trim());\nfor (let i = 1; i <= n; i++) {\n  console.log(i % 15 === 0 ? "FizzBuzz" : i % 3 === 0 ? "Fizz" : i % 5 === 0 ? "Buzz" : i);\n}',
	},
	{
		key: "valid-parens",
		type: "CODING",
		title: "Valid parentheses",
		description:
			"Read a string made of ()[]{} characters. Print `true` if every bracket is closed in the correct order, otherwise `false`.",
		points: 25,
		testCases: [
			{ input: "()[]{}", expectedOutput: "true", isHidden: false, weight: 1 },
			{ input: "(]", expectedOutput: "false", isHidden: false, weight: 1 },
			{ input: "{[()]}", expectedOutput: "true", isHidden: true, weight: 1 },
			{ input: "((", expectedOutput: "false", isHidden: true, weight: 1 },
		],
		sampleCode:
			'const s = require("fs").readFileSync(0, "utf8").trim();\nconst pairs = { ")": "(", "]": "[", "}": "{" };\nconst stack = [];\nlet ok = true;\nfor (const ch of s) {\n  if ("([{".includes(ch)) stack.push(ch);\n  else if (stack.pop() !== pairs[ch]) { ok = false; break; }\n}\nconsole.log(ok && stack.length === 0);',
	},
	{
		key: "event-loop",
		type: "WRITTEN",
		title: "Explain the JavaScript event loop",
		description:
			"In your own words, explain how the JavaScript event loop works. Mention the call stack, the task queue and microtasks.",
		points: 15,
		sampleAnswer:
			"JavaScript runs on a single thread with one call stack. When asynchronous work such as a timer or a network request finishes, its callback is placed in a queue. The event loop watches the call stack and, once it is empty, moves the next callback from the queue onto the stack. Promise callbacks go into the microtask queue, which is drained completely before the next task from the normal queue runs, so a resolved promise always runs before a setTimeout of zero.",
	},
	{
		key: "rest-graphql",
		type: "WRITTEN",
		title: "REST versus GraphQL",
		description:
			"Compare REST and GraphQL for a mobile app backend. When would you choose each one?",
		points: 20,
		sampleAnswer:
			"REST exposes many endpoints, each returning a fixed shape, which makes caching and tooling simple but can cause over-fetching and several round trips on slow mobile networks. GraphQL exposes one endpoint where the client asks for exactly the fields it needs, which reduces payload size and round trips, at the cost of more complex caching, query cost control and server setup. I would pick REST for simple, cache-friendly APIs and GraphQL when many client types need flexible data from related entities.",
	},
	{
		key: "slow-page",
		type: "WRITTEN",
		title: "Debug a slow web page",
		description:
			"A product page feels slow for users. Describe the steps you would take to find and fix the cause.",
		points: 20,
		sampleAnswer:
			"First I would measure instead of guess: run Lighthouse and record a profile in the browser performance tab to see whether the delay is network, rendering or JavaScript. For network I would check payload sizes, image formats, caching headers and slow API calls. For rendering I would look at layout shifts and large images without dimensions. For JavaScript I would find long tasks and split or lazy-load heavy bundles. After each change I would measure again to confirm it helped.",
	},
];

const GLOBEX_PROBLEMS: ProblemSeed[] = [
	{
		key: "g-test-types",
		type: "MCQ",
		title: "Unit tests versus integration tests",
		description:
			"What is the main difference between a unit test and an integration test?",
		points: 10,
		options: [
			{
				text: "A unit test checks one piece in isolation, an integration test checks pieces working together",
				isCorrect: true,
			},
			{ text: "A unit test is always manual", isCorrect: false },
			{
				text: "An integration test never touches a database",
				isCorrect: false,
			},
			{ text: "There is no difference", isCorrect: false },
		],
	},
	{
		key: "g-test-plan",
		type: "WRITTEN",
		title: "Test plan for a login form",
		description:
			"List the test cases you would write for a login form with email and password.",
		points: 20,
		sampleAnswer:
			"Valid credentials sign the user in. A wrong password and an unknown email show a clear error without revealing which one is wrong. Empty fields and a badly formatted email show validation messages. A locked or suspended account is refused with a helpful message. I would also test the password visibility toggle, keyboard submission with Enter, and rate limiting after repeated failures.",
	},
];

// ---------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------
interface AssessmentSeed {
	key: string;
	title: string;
	description: string;
	durationMinutes: number;
	passingScore: number;
	status: "DRAFT" | "PUBLISHED" | "CLOSED";
	ageDays: number;
	problems: { key: string; points: number }[];
}

const ACME_ASSESSMENTS: AssessmentSeed[] = [
	{
		key: "frontend",
		title: "Frontend Developer Screening",
		description:
			"A 45 minute screening for frontend roles: JavaScript and CSS basics, two coding problems and one written answer.",
		durationMinutes: 45,
		passingScore: 40,
		status: "PUBLISHED",
		ageDays: 45,
		problems: [
			{ key: "typeof-null", points: 5 },
			{ key: "box-model", points: 5 },
			{ key: "reverse-string", points: 15 },
			{ key: "two-sum", points: 20 },
			{ key: "event-loop", points: 15 },
		],
	},
	{
		key: "jsquiz",
		title: "JavaScript Fundamentals Quiz",
		description: "A short multiple choice quiz. It is graded automatically.",
		durationMinutes: 15,
		passingScore: 12,
		status: "PUBLISHED",
		ageDays: 60,
		problems: [
			{ key: "typeof-null", points: 5 },
			{ key: "box-model", points: 5 },
			{ key: "http-201", points: 5 },
			{ key: "sql-distinct", points: 5 },
		],
	},
	{
		key: "hooks",
		title: "React Hooks Deep Dive",
		description: "One concept question and one written debugging scenario.",
		durationMinutes: 30,
		passingScore: 20,
		status: "PUBLISHED",
		ageDays: 25,
		problems: [
			{ key: "use-effect", points: 10 },
			{ key: "slow-page", points: 20 },
		],
	},
	{
		key: "backend",
		title: "Backend Engineer Take-home",
		description:
			"A draft assessment for backend roles. Add more problems before publishing.",
		durationMinutes: 60,
		passingScore: 30,
		status: "DRAFT",
		ageDays: 5,
		problems: [
			{ key: "valid-parens", points: 25 },
			{ key: "fizzbuzz", points: 15 },
			{ key: "rest-graphql", points: 20 },
		],
	},
	{
		key: "python",
		title: "Python Basics (Spring Intake)",
		description: "Closed assessment from the previous hiring round.",
		durationMinutes: 40,
		passingScore: 25,
		status: "CLOSED",
		ageDays: 130,
		problems: [
			{ key: "sql-distinct", points: 10 },
			{ key: "http-201", points: 10 },
			{ key: "fizzbuzz", points: 20 },
		],
	},
	{
		key: "ds",
		title: "Data Structures Round 1",
		description: "Two classic problems and one quick question.",
		durationMinutes: 50,
		passingScore: 35,
		status: "PUBLISHED",
		ageDays: 12,
		problems: [
			{ key: "two-sum", points: 25 },
			{ key: "valid-parens", points: 25 },
			{ key: "typeof-null", points: 10 },
		],
	},
];

const GLOBEX_ASSESSMENT: AssessmentSeed = {
	key: "g-qa",
	title: "QA Engineer Screening",
	description: "Testing fundamentals and a short test plan.",
	durationMinutes: 30,
	passingScore: 20,
	status: "PUBLISHED",
	ageDays: 20,
	problems: [
		{ key: "g-test-types", points: 10 },
		{ key: "g-test-plan", points: 20 },
	],
};

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------
const CANDIDATES = [
	{
		name: "Amina Rahman",
		headline: "Frontend developer, 3 years",
		skills: ["React", "TypeScript", "CSS"],
	},
	{
		name: "Tanvir Hasan",
		headline: "Full stack developer",
		skills: ["Node.js", "PostgreSQL", "React"],
	},
	{
		name: "Nusrat Jahan",
		headline: "Recent CS graduate",
		skills: ["JavaScript", "Python", "SQL"],
	},
	{
		name: "Rafiq Ahmed",
		headline: "Junior web developer",
		skills: ["HTML", "CSS", "JavaScript"],
	},
	{
		name: "Sadia Islam",
		headline: "Software engineer, 5 years",
		skills: ["Java", "Spring", "AWS"],
	},
	{
		name: "Imran Hossain",
		headline: "Backend developer",
		skills: ["Node.js", "Express", "Redis"],
	},
	{
		name: "Farhana Akter",
		headline: "QA engineer moving into development",
		skills: ["Testing", "Cypress", "JavaScript"],
	},
	{
		name: "Kamal Uddin",
		headline: "Mobile and web developer",
		skills: ["React Native", "TypeScript"],
	},
	{
		name: "Mehnaz Chowdhury",
		headline: "Data analyst learning web development",
		skills: ["Python", "SQL", "Pandas"],
	},
	{
		name: "Shakib Khan",
		headline: "Competitive programmer",
		skills: ["C++", "Algorithms", "Python"],
	},
	{
		name: "Lamia Sultana",
		headline: "UI engineer",
		skills: ["React", "Tailwind CSS", "Figma"],
	},
	{
		name: "Arif Mahmud",
		headline: "DevOps and backend",
		skills: ["Docker", "Node.js", "Linux"],
	},
	{
		name: "Tasnim Ferdous",
		headline: "Frontend intern",
		skills: ["Next.js", "JavaScript"],
	},
	{
		name: "Zubair Alam",
		headline: "Freelance developer",
		skills: ["PHP", "Laravel"],
	},
] as const;

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, ".");
const candidateEmail = (name: string) => `${slug(name)}@demo${DEMO_SUFFIX}`;

// ---------------------------------------------------------------------------
// Invitation and attempt plans
// ---------------------------------------------------------------------------
type PlanState =
	| "pending"
	| "expired"
	| "revoked"
	| "accepted-idle"
	| "in-progress"
	| "graded-high"
	| "graded-mid"
	| "graded-low"
	| "awaiting-review";

interface Plan {
	assessment: string;
	candidate: number | "main"; // index into CANDIDATES, or the demo candidate
	state: PlanState;
	days: number; // how many days ago the attempt (or invitation) happened
}

const ACME_PLAN: Plan[] = [
	// Frontend Developer Screening (14 invitations, so the list paginates)
	{ assessment: "frontend", candidate: 0, state: "graded-high", days: 20 },
	{ assessment: "frontend", candidate: 1, state: "graded-mid", days: 19 },
	{ assessment: "frontend", candidate: 2, state: "graded-high", days: 18 },
	{ assessment: "frontend", candidate: 3, state: "graded-low", days: 17 },
	{ assessment: "frontend", candidate: 4, state: "awaiting-review", days: 6 },
	{ assessment: "frontend", candidate: 5, state: "awaiting-review", days: 5 },
	{ assessment: "frontend", candidate: 6, state: "awaiting-review", days: 4 },
	{ assessment: "frontend", candidate: 7, state: "awaiting-review", days: 3 },
	{
		assessment: "frontend",
		candidate: "main",
		state: "awaiting-review",
		days: 2,
	},
	{ assessment: "frontend", candidate: 8, state: "in-progress", days: 0 },
	{ assessment: "frontend", candidate: 9, state: "pending", days: 2 },
	{ assessment: "frontend", candidate: 10, state: "pending", days: 1 },
	{ assessment: "frontend", candidate: 11, state: "expired", days: 14 },
	{ assessment: "frontend", candidate: 12, state: "revoked", days: 5 },
	// JavaScript Fundamentals Quiz (auto graded)
	{ assessment: "jsquiz", candidate: "main", state: "accepted-idle", days: 3 },
	{ assessment: "jsquiz", candidate: 0, state: "graded-high", days: 40 },
	{ assessment: "jsquiz", candidate: 1, state: "graded-mid", days: 38 },
	{ assessment: "jsquiz", candidate: 2, state: "graded-low", days: 36 },
	{ assessment: "jsquiz", candidate: 3, state: "graded-high", days: 30 },
	{ assessment: "jsquiz", candidate: 4, state: "graded-mid", days: 25 },
	{ assessment: "jsquiz", candidate: 5, state: "graded-low", days: 20 },
	{ assessment: "jsquiz", candidate: 6, state: "pending", days: 1 },
	// React Hooks Deep Dive
	{ assessment: "hooks", candidate: "main", state: "pending", days: 1 },
	{ assessment: "hooks", candidate: 1, state: "awaiting-review", days: 7 },
	{ assessment: "hooks", candidate: 2, state: "graded-high", days: 15 },
	{ assessment: "hooks", candidate: 7, state: "pending", days: 3 },
	// Python Basics (closed, older)
	{ assessment: "python", candidate: "main", state: "graded-high", days: 110 },
	{ assessment: "python", candidate: 0, state: "graded-high", days: 118 },
	{ assessment: "python", candidate: 1, state: "graded-mid", days: 115 },
	{ assessment: "python", candidate: 2, state: "graded-low", days: 113 },
	{ assessment: "python", candidate: 3, state: "graded-mid", days: 109 },
	{ assessment: "python", candidate: 4, state: "graded-high", days: 105 },
	// Data Structures Round 1
	{ assessment: "ds", candidate: 10, state: "pending", days: 2 },
	{ assessment: "ds", candidate: 11, state: "pending", days: 1 },
	{ assessment: "ds", candidate: 12, state: "accepted-idle", days: 4 },
	{ assessment: "ds", candidate: 3, state: "pending", days: 3 },
];

const GLOBEX_PLAN: Plan[] = [
	{ assessment: "g-qa", candidate: 3, state: "pending", days: 2 },
	{ assessment: "g-qa", candidate: 4, state: "awaiting-review", days: 5 },
	{ assessment: "g-qa", candidate: 5, state: "graded-high", days: 9 },
];

const GRADE_OUTCOME = {
	"graded-high": {
		status: "PASSED",
		ratio: 1,
		feedback:
			"Correct and well structured. Clear reasoning and good handling of edge cases.",
	},
	"graded-mid": {
		status: "PARTIAL",
		ratio: 0.5,
		feedback:
			"Works for the basic cases but misses some edge cases. Explanation could be more precise.",
	},
	"graded-low": {
		status: "FAILED",
		ratio: 0.2,
		feedback:
			"The approach does not solve the problem. Review the fundamentals and try again.",
	},
} as const;

// ---------------------------------------------------------------------------
// Types and helpers for creation
// ---------------------------------------------------------------------------
interface ProblemRecord {
	id: string;
	seed: ProblemSeed;
	options: { id: string; isCorrect: boolean }[];
}
interface AssessmentRecord {
	id: string;
	seed: AssessmentSeed;
	problems: { record: ProblemRecord; points: number }[];
}
interface UserRef {
	id: string;
	email: string;
	name: string;
}
interface LedgerEvent {
	type: "PURCHASE" | "DEDUCTION" | "REFUND" | "ADJUSTMENT";
	amount: number;
	at: Date;
	referenceId?: string;
}

type AuditInput = Prisma.AuditLogCreateManyInput;
const audits: AuditInput[] = [];
const audit = (
	actor: { id: string; role: AuditInput["actorRole"] },
	action: string,
	entityType: string,
	entityId: string,
	createdAt: Date,
	metadata: Record<string, string | number> = {},
) => {
	audits.push({
		actorId: actor.id,
		actorRole: actor.role,
		action,
		entityType,
		entityId,
		createdAt,
		metadata: { ...metadata, demo: true },
	});
};

const createProblems = async (
	companyId: string,
	seeds: ProblemSeed[],
	createdBy: UserRef[],
	createdAt: Date,
) => {
	const records = new Map<string, ProblemRecord>();
	for (const [index, seed] of seeds.entries()) {
		const at = addDays(createdAt, index);
		const created = await prisma.problem.create({
			data: {
				companyId,
				type: seed.type,
				title: seed.title,
				description: seed.description,
				points: seed.points,
				createdAt: at,
				...(seed.type === "MCQ" && {
					mcqOptions: {
						create: seed.options.map((o, order) => ({
							text: o.text,
							isCorrect: o.isCorrect,
							order,
						})),
					},
				}),
				...(seed.type === "CODING" && {
					testCases: { create: seed.testCases },
				}),
			},
			include: { mcqOptions: { orderBy: { order: "asc" } } },
		});
		records.set(seed.key, {
			id: created.id,
			seed,
			options: created.mcqOptions.map((o) => ({
				id: o.id,
				isCorrect: o.isCorrect,
			})),
		});
		const actor = must(createdBy[index % createdBy.length], "creator missing");
		audit(
			{ id: actor.id, role: "ASSESSMENT_CREATOR" },
			"PROBLEM_CREATED",
			"Problem",
			created.id,
			at,
			{ title: seed.title },
		);
	}
	return records;
};

const createAssessments = async (
	companyId: string,
	seeds: AssessmentSeed[],
	problems: Map<string, ProblemRecord>,
	actor: UserRef,
) => {
	const records = new Map<string, AssessmentRecord>();
	for (const seed of seeds) {
		const createdAt = daysAgo(seed.ageDays);
		const links = seed.problems.map((p, order) => ({
			record: must(problems.get(p.key), `problem ${p.key} missing`),
			points: p.points,
			order,
		}));
		const created = await prisma.assessment.create({
			data: {
				companyId,
				title: seed.title,
				description: seed.description,
				durationMinutes: seed.durationMinutes,
				passingScore: seed.passingScore,
				status: seed.status,
				createdAt,
				assessmentProblems: {
					create: links.map((l) => ({
						problemId: l.record.id,
						order: l.order,
						points: l.points,
					})),
				},
			},
		});
		records.set(seed.key, {
			id: created.id,
			seed,
			problems: links.map((l) => ({ record: l.record, points: l.points })),
		});
		audit(
			{ id: actor.id, role: "COMPANY_OWNER" },
			"ASSESSMENT_CREATED",
			"Assessment",
			created.id,
			createdAt,
			{ title: seed.title },
		);
		if (seed.status !== "DRAFT") {
			audit(
				{ id: actor.id, role: "COMPANY_OWNER" },
				"ASSESSMENT_PUBLISHED",
				"Assessment",
				created.id,
				addDays(createdAt, 1),
				{ title: seed.title },
			);
		}
		if (seed.status === "CLOSED") {
			audit(
				{ id: actor.id, role: "COMPANY_OWNER" },
				"ASSESSMENT_CLOSED",
				"Assessment",
				created.id,
				addDays(createdAt, 100),
				{ title: seed.title },
			);
		}
	}
	return records;
};

const createAttempt = async (
	assessment: AssessmentRecord,
	candidateId: string,
	state: PlanState,
	when: Date,
	evaluator: UserRef,
) => {
	const inProgress = state === "in-progress";
	const attempt = await prisma.attempt.create({
		data: {
			assessmentId: assessment.id,
			candidateId,
			status: inProgress ? "IN_PROGRESS" : "SUBMITTED",
			startedAt: when,
			expiresAt: addMinutes(when, assessment.seed.durationMinutes),
			createdAt: when,
		},
	});

	let total = 0;
	let pending = false;

	for (const [index, { record, points }] of assessment.problems.entries()) {
		if (inProgress && index > 0) break;
		const { seed } = record;
		const submittedAt = addMinutes(when, 5 + index * 6);

		if (seed.type === "MCQ") {
			const wantCorrect =
				state === "graded-high" || (state !== "graded-low" && index % 2 === 0);
			const option = must(
				record.options.find((o) => o.isCorrect === wantCorrect) ??
					record.options[0],
				"mcq option missing",
			);
			const submission = await prisma.submission.create({
				data: {
					attemptId: attempt.id,
					problemId: record.id,
					selectedOptionId: option.id,
					submittedAt,
				},
			});
			if (inProgress) continue;
			const score = option.isCorrect ? points : 0;
			total += score;
			await prisma.submissionResult.create({
				data: {
					submissionId: submission.id,
					score,
					maxScore: points,
					status: option.isCorrect ? "PASSED" : "FAILED",
				},
			});
			continue;
		}

		const submission = await prisma.submission.create({
			data: {
				attemptId: attempt.id,
				problemId: record.id,
				submittedAt,
				...(seed.type === "CODING"
					? { code: seed.sampleCode, language: "javascript" }
					: { answerText: seed.sampleAnswer }),
			},
		});
		if (inProgress) continue;

		if (state === "awaiting-review") {
			pending = true;
			await prisma.submissionResult.create({
				data: {
					submissionId: submission.id,
					score: 0,
					maxScore: points,
					status: "PENDING_REVIEW",
				},
			});
			continue;
		}

		const outcome = GRADE_OUTCOME[state as keyof typeof GRADE_OUTCOME];
		const score = Math.round(points * outcome.ratio);
		total += score;
		const evaluatedAt = earlier(addDays(when, 1));
		const result = await prisma.submissionResult.create({
			data: {
				submissionId: submission.id,
				score,
				maxScore: points,
				status: outcome.status,
				feedback: outcome.feedback,
				evaluatedBy: evaluator.id,
				evaluatedAt,
			},
		});
		audit(
			{ id: evaluator.id, role: "EVALUATOR" },
			"SUBMISSION_GRADED",
			"SubmissionResult",
			result.id,
			evaluatedAt,
			{ score, status: outcome.status },
		);
	}

	if (!inProgress) {
		await prisma.attempt.update({
			where: { id: attempt.id },
			data: { totalScore: pending ? null : total },
		});
	}
};

const runPlan = async (
	plan: Plan[],
	assessments: Map<string, AssessmentRecord>,
	demoCandidates: UserRef[],
	mainCandidate: UserRef,
	sender: { id: string; role: AuditInput["actorRole"] },
	owner: UserRef,
	evaluator: UserRef,
) => {
	const ledger: LedgerEvent[] = [];
	const liveLinks: string[] = [];

	for (const step of plan) {
		const assessment = must(
			assessments.get(step.assessment),
			`assessment ${step.assessment} missing`,
		);
		const candidate =
			step.candidate === "main"
				? mainCandidate
				: must(demoCandidates[step.candidate], "candidate missing");

		const accepted = [
			"accepted-idle",
			"in-progress",
			"graded-high",
			"graded-mid",
			"graded-low",
			"awaiting-review",
		].includes(step.state);
		const sentAt =
			step.state === "in-progress"
				? daysAgo(1)
				: accepted
					? daysAgo(step.days + 2)
					: step.state === "expired"
						? daysAgo(step.days)
						: daysAgo(step.days);
		const token = crypto.randomBytes(32).toString("hex");

		const status = accepted
			? "ACCEPTED"
			: step.state === "expired"
				? "EXPIRED"
				: step.state === "revoked"
					? "REVOKED"
					: "PENDING";

		const invitation = await prisma.invitation.create({
			data: {
				assessmentId: assessment.id,
				candidateEmail: candidate.email,
				candidateId: accepted ? candidate.id : null,
				token,
				status,
				expiresAt: addDays(sentAt, 7),
				createdAt: sentAt,
			},
		});

		ledger.push({
			type: "DEDUCTION",
			amount: 1,
			at: sentAt,
			referenceId: invitation.id,
		});
		audit(sender, "INVITATION_SENT", "Invitation", invitation.id, sentAt, {
			candidateEmail: candidate.email,
			assessmentId: assessment.id,
		});

		if (step.state === "revoked") {
			const revokedAt = addDays(sentAt, 1);
			ledger.push({
				type: "REFUND",
				amount: 1,
				at: revokedAt,
				referenceId: invitation.id,
			});
			audit(
				{ id: owner.id, role: "COMPANY_OWNER" },
				"INVITATION_REVOKED",
				"Invitation",
				invitation.id,
				revokedAt,
				{ candidateEmail: candidate.email },
			);
		}
		if (step.state === "pending") {
			liveLinks.push(
				`${candidate.email} -> ${assessment.seed.title}: ${config.app_url}/invitations/accept/${token}`,
			);
		}

		if (accepted) {
			audit(
				{ id: candidate.id, role: "CANDIDATE" },
				"INVITATION_ACCEPTED",
				"Invitation",
				invitation.id,
				addDays(sentAt, 1 / 24),
				{ assessmentId: assessment.id },
			);
			if (step.state !== "accepted-idle") {
				const when =
					step.state === "in-progress"
						? new Date(Date.now() - 8 * 60_000)
						: daysAgo(step.days);
				await createAttempt(
					assessment,
					candidate.id,
					step.state,
					when,
					evaluator,
				);
			}
		}
	}

	return { ledger, liveLinks };
};

const writeLedger = async (companyId: string, events: LedgerEvent[]) => {
	const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
	let balance = 0;
	for (const event of sorted) {
		balance += event.type === "DEDUCTION" ? -event.amount : event.amount;
		await prisma.creditTransaction.create({
			data: {
				companyId,
				type: event.type,
				amount: event.amount,
				balanceAfter: balance,
				referenceId: event.referenceId,
				createdAt: event.at,
			},
		});
	}
	await prisma.company.update({
		where: { id: companyId },
		data: { creditBalance: balance },
	});
	return balance;
};

const createPayment = async (
	companyId: string,
	owner: UserRef,
	key: string,
	credits: number,
	status: "SUCCEEDED" | "PENDING" | "FAILED",
	at: Date,
) => {
	const payment = await prisma.payment.create({
		data: {
			companyId,
			stripeSessionId: `cs_test_demo_${key}`,
			amount: credits * config.credit_price_in_cents,
			creditsPurchased: credits,
			status,
			createdAt: at,
		},
	});
	if (status === "SUCCEEDED") {
		audit(
			{ id: owner.id, role: "COMPANY_OWNER" },
			"PAYMENT_SUCCEEDED",
			"Payment",
			payment.id,
			at,
			{
				creditsPurchased: credits,
				amount: payment.amount,
			},
		);
	}
};

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
const resetDemoData = async (acmeCompanyId: string) => {
	console.log("Resetting demo data...");
	const demoUsers = await prisma.user.findMany({
		where: { email: { endsWith: DEMO_SUFFIX } },
		select: { id: true },
	});
	const demoUserIds = demoUsers.map((u) => u.id);
	const demoCompanies = await prisma.company.findMany({
		where: { companyName: { in: DEMO_COMPANIES } },
		select: { id: true },
	});
	const companyIds = [acmeCompanyId, ...demoCompanies.map((c) => c.id)];

	const assessments = await prisma.assessment.findMany({
		where: { companyId: { in: companyIds } },
		select: { id: true },
	});
	const assessmentIds = assessments.map((a) => a.id);

	await prisma.attempt.deleteMany({
		where: { assessmentId: { in: assessmentIds } },
	});
	await prisma.invitation.deleteMany({
		where: { assessmentId: { in: assessmentIds } },
	});
	await prisma.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
	await prisma.problem.deleteMany({ where: { companyId: { in: companyIds } } });
	await prisma.payment.deleteMany({ where: { companyId: { in: companyIds } } });
	await prisma.creditTransaction.deleteMany({
		where: { companyId: { in: companyIds } },
	});
	await prisma.teamInvitation.deleteMany({
		where: { companyId: { in: companyIds } },
	});
	await prisma.auditLog.deleteMany({
		where: {
			OR: [
				{ metadata: { path: ["demo"], equals: true } },
				{ actorId: { in: demoUserIds } },
			],
		},
	});
	await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } });
	await prisma.company.deleteMany({
		where: { companyName: { in: DEMO_COMPANIES } },
	});
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const main = async () => {
	await prisma.$connect();
	await seedAllRoles(); // make sure the five base accounts exist

	const ownerUser = must(
		await prisma.user.findUnique({
			where: { email: config.company_owner_email ?? "" },
		}),
		"Company owner not found. Check the seed variables in .env",
	);
	const acmeId = must(ownerUser.companyId, "Owner has no company");

	const already = await prisma.user.findUnique({
		where: { email: candidateEmail(CANDIDATES[0].name) },
	});
	if (already && !RESET) {
		console.log("Demo data already exists. Run with --reset to rebuild it.");
		return;
	}
	if (RESET) await resetDemoData(acmeId);

	const ref = (u: { id: string; email: string; name: string }): UserRef => ({
		id: u.id,
		email: u.email,
		name: u.name,
	});
	const find = async (email: string | undefined) =>
		ref(
			must(
				await prisma.user.findUnique({ where: { email: email ?? "" } }),
				`User ${email} not found`,
			),
		);

	const owner = ref(ownerUser);
	const creator = await find(config.assessment_creator_email);
	const evaluator = await find(config.evaluator_email);
	const admin = await find(config.admin_email);
	const mainCandidate = await find(config.candidate_email);

	const passwordHash = await bcrypt.hash(
		DEMO_PASSWORD,
		Number(config.bcrypt_salt_rounds) || 10,
	);

	// Acme looks like it has been around for a while
	await prisma.company.update({
		where: { id: acmeId },
		data: { createdAt: daysAgo(160) },
	});
	await prisma.user.update({
		where: { id: owner.id },
		data: { createdAt: daysAgo(160) },
	});
	audit(
		{ id: owner.id, role: "COMPANY_OWNER" },
		"COMPANY_CREATED",
		"Company",
		acmeId,
		daysAgo(160),
	);

	// ---- Candidates, spread across the last six months for the trend charts
	const demoCandidates: UserRef[] = [];
	for (const [index, c] of CANDIDATES.entries()) {
		const user = await prisma.user.create({
			data: {
				email: candidateEmail(c.name),
				name: c.name,
				passwordHash,
				role: "CANDIDATE",
				status: c.name === "Zubair Alam" ? "SUSPENDED" : "ACTIVE",
				emailVerified: true,
				createdAt: daysAgo(150 - index * 11),
				candidateProfile: {
					create: { headline: c.headline, skills: [...c.skills] },
				},
			},
		});
		demoCandidates.push(ref(user));
	}

	// ---- Acme
	const acmeProblems = await createProblems(
		acmeId,
		ACME_PROBLEMS,
		[creator, owner],
		daysAgo(100),
	);
	const acmeAssessments = await createAssessments(
		acmeId,
		ACME_ASSESSMENTS,
		acmeProblems,
		owner,
	);
	const acme = await runPlan(
		ACME_PLAN,
		acmeAssessments,
		demoCandidates,
		mainCandidate,
		{ id: creator.id, role: "ASSESSMENT_CREATOR" },
		owner,
		evaluator,
	);

	// Purchases are sized so the balance never goes negative and ends at 12
	const net = acme.ledger.reduce(
		(sum, e) => sum + (e.type === "DEDUCTION" ? e.amount : -e.amount),
		0,
	);
	const totalPurchased = net + 12;
	const firstPurchase = Math.ceil(totalPurchased * 0.6);
	const secondPurchase = totalPurchased - firstPurchase;
	const firstAt = daysAgo(150);
	const secondAt = daysAgo(95);
	acme.ledger.push(
		{ type: "PURCHASE", amount: firstPurchase, at: firstAt },
		{ type: "PURCHASE", amount: secondPurchase, at: secondAt },
	);
	const acmeBalance = await writeLedger(acmeId, acme.ledger);
	await createPayment(
		acmeId,
		owner,
		"acme_1",
		firstPurchase,
		"SUCCEEDED",
		firstAt,
	);
	await createPayment(
		acmeId,
		owner,
		"acme_2",
		secondPurchase,
		"SUCCEEDED",
		secondAt,
	);
	await createPayment(acmeId, owner, "acme_pending", 20, "PENDING", daysAgo(2));
	await createPayment(acmeId, owner, "acme_failed", 10, "FAILED", daysAgo(40));

	for (const [email, role, status, days] of [
		["new.hire@demo.example", "ASSESSMENT_CREATOR", "PENDING", 1],
		["senior.reviewer@demo.example", "EVALUATOR", "PENDING", 3],
		["old.invite@demo.example", "EVALUATOR", "EXPIRED", 20],
	] as const) {
		const invitation = await prisma.teamInvitation.create({
			data: {
				companyId: acmeId,
				email,
				role,
				token: crypto.randomBytes(32).toString("hex"),
				status,
				expiresAt: addDays(daysAgo(days), 7),
				createdAt: daysAgo(days),
			},
		});
		audit(
			{ id: owner.id, role: "COMPANY_OWNER" },
			"TEAM_MEMBER_INVITED",
			"TeamInvitation",
			invitation.id,
			daysAgo(days),
			{ email, role },
		);
	}

	// ---- Globex Labs (active second company, proves company isolation)
	const globex = await prisma.company.create({
		data: { companyName: "Globex Labs", createdAt: daysAgo(90) },
	});
	const globexOwnerUser = await prisma.user.create({
		data: {
			email: `owner@globex${DEMO_SUFFIX}`,
			name: "Grace Whitfield",
			passwordHash,
			role: "COMPANY_OWNER",
			emailVerified: true,
			companyId: globex.id,
			createdAt: daysAgo(90),
		},
	});
	const globexOwner = ref(globexOwnerUser);
	audit(
		{ id: globexOwner.id, role: "COMPANY_OWNER" },
		"COMPANY_CREATED",
		"Company",
		globex.id,
		daysAgo(90),
	);
	const globexProblems = await createProblems(
		globex.id,
		GLOBEX_PROBLEMS,
		[globexOwner],
		daysAgo(30),
	);
	const globexAssessments = await createAssessments(
		globex.id,
		[GLOBEX_ASSESSMENT],
		globexProblems,
		globexOwner,
	);
	const globexRun = await runPlan(
		GLOBEX_PLAN,
		globexAssessments,
		demoCandidates,
		mainCandidate,
		{ id: globexOwner.id, role: "COMPANY_OWNER" },
		globexOwner,
		globexOwner,
	);
	globexRun.ledger.push(
		{ type: "PURCHASE", amount: 20, at: daysAgo(80) },
		{ type: "ADJUSTMENT", amount: 5, at: daysAgo(10) },
	);
	await writeLedger(globex.id, globexRun.ledger);
	await createPayment(
		globex.id,
		globexOwner,
		"globex_1",
		20,
		"SUCCEEDED",
		daysAgo(80),
	);
	audit(
		{ id: admin.id, role: "ADMIN" },
		"CREDIT_ADJUSTED",
		"Company",
		globex.id,
		daysAgo(10),
		{ amount: 5 },
	);

	// ---- Initech Ltd (suspended)
	const initech = await prisma.company.create({
		data: {
			companyName: "Initech Ltd",
			status: "SUSPENDED",
			createdAt: daysAgo(35),
		},
	});
	const initechOwnerUser = await prisma.user.create({
		data: {
			email: `owner@initech${DEMO_SUFFIX}`,
			name: "Peter Gibbons",
			passwordHash,
			role: "COMPANY_OWNER",
			emailVerified: true,
			companyId: initech.id,
			createdAt: daysAgo(35),
		},
	});
	const initechOwner = ref(initechOwnerUser);
	audit(
		{ id: initechOwner.id, role: "COMPANY_OWNER" },
		"COMPANY_CREATED",
		"Company",
		initech.id,
		daysAgo(35),
	);
	await writeLedger(initech.id, [
		{ type: "PURCHASE", amount: 5, at: daysAgo(30) },
	]);
	await createPayment(
		initech.id,
		initechOwner,
		"initech_1",
		5,
		"SUCCEEDED",
		daysAgo(30),
	);
	audit(
		{ id: admin.id, role: "ADMIN" },
		"COMPANY_SUSPENDED",
		"Company",
		initech.id,
		daysAgo(7),
	);
	audit(
		{ id: admin.id, role: "ADMIN" },
		"USER_SUSPENDED",
		"User",
		must(demoCandidates[13], "candidate").id,
		daysAgo(4),
	);

	await prisma.auditLog.createMany({ data: audits });

	// The admin stats are cached in Redis, so clear them to show fresh numbers
	try {
		await redis.del(config.platform_stats_cache_key);
		await redis.del(`${config.platform_stats_cache_key}:trends`);
	} catch {
		console.log(
			"Could not clear the admin stats cache. It expires on its own.",
		);
	}

	console.log("\nDemo data created.");
	console.log(`  Acme credit balance: ${acmeBalance}`);
	console.log(`  Audit log rows: ${audits.length}`);
	console.log("\nExtra accounts (password for all: " + DEMO_PASSWORD + ")");
	console.log(`  owner@globex${DEMO_SUFFIX}   Globex Labs owner`);
	console.log(
		`  owner@initech${DEMO_SUFFIX}  Initech Ltd owner (company suspended)`,
	);
	console.log(`  ${candidateEmail("Amina Rahman")}  demo candidate`);
	console.log(`  ${candidateEmail("Zubair Alam")}  suspended candidate`);
	console.log(
		"\nPending invitation links (open while logged out or as that candidate):",
	);
	for (const line of [...acme.liveLinks, ...globexRun.liveLinks])
		console.log(`  ${line}`);
};

main()
	.catch((error) => {
		console.error("Demo seed failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
