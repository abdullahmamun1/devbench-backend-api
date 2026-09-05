import type { Prisma, UserRole } from "../../generated/prisma";
import { prisma } from "../lib/prisma";

interface IAuditLogInput {
	actorId: string;
	actorRole: UserRole;
	action: string;
	entityType: string;
	entityId: string;
	metadata?: Prisma.InputJsonValue;
}

export const writeAuditLog = async (
	input: IAuditLogInput,
	tx: Pick<typeof prisma, "auditLog"> = prisma,
) => {
	try {
		await tx.auditLog.create({ data: input });
	} catch (error) {
		console.error("Failed to write audit log:", error);
	}
};
