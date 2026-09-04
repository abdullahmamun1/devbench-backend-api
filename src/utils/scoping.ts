import type { UserRole } from "../../generated/prisma";
import { createError } from "./createError";

interface IScopeCaller {
	role: UserRole;
	companyId?: string | null;
}

export const resolveCompanyScope = (
	caller: IScopeCaller,
): string | undefined => {
	if (caller.role === "ADMIN") {
		return undefined;
	}

	if (!caller.companyId) {
		throw createError(
			400,
			"You must belong to a company to access this resource",
		);
	}

	return caller.companyId;
};

export const requireCompanyId = (caller: {
	companyId?: string | null;
}): string => {
	if (!caller.companyId) {
		throw createError(400, "You do not belong to a company");
	}
	return caller.companyId;
};
