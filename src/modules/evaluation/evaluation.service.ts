import type {
	ICallerInfo,
	IEvaluationFilterQuery,
	IGradeSubmissionPayload,
} from "./evaluation.interface";

const getPendingSubmissions = async (
	query: IEvaluationFilterQuery,
	caller: ICallerInfo,
) => {};

const getSubmissionDetail = async (
	submissionResultId: string,
	caller: ICallerInfo,
) => {};

const gradeSubmission = async (
	submissionResultId: string,
	payload: IGradeSubmissionPayload,
	caller: ICallerInfo,
) => {};

export const evaluationService = {
	getPendingSubmissions,
	getSubmissionDetail,
	gradeSubmission,
};
