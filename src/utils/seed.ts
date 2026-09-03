import bcrypt from "bcryptjs";
import { UserRole } from "../../generated/prisma/client";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";

export const seedAdmin = async () => {
	try {
		const isAdminExist = await prisma.user.findFirst({
			where: {
				role: UserRole.ADMIN,
			},
		});
		if (isAdminExist) {
			console.log("✓ Admin Already Exists");
			return;
		}

		const email = config.admin_email;
		const password = config.admin_password;
		const name = config.admin_name;

		if (!email || !password || !name) {
			console.log("⚠️  Admin credentials missing in .env file");
			return;
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const admin = await prisma.user.create({
			data: {
				email,
				name,
				passwordHash: hashedPassword,
				role: UserRole.ADMIN,
				status: "ACTIVE",
			},
		});

		console.log("✓ Admin Created:", admin.email);
	} catch (error) {
		console.log("❌ Error Seeding Admin:", error);
	}
};

export const seedCompanyOwner = async () => {
	try {
		const isOwnerExist = await prisma.user.findFirst({
			where: {
				role: UserRole.COMPANY_OWNER,
			},
		});
		if (isOwnerExist) {
			console.log("✓ Company Owner Already Exists");
			return;
		}

		const email = config.company_owner_email;
		const password = config.company_owner_password;
		const name = config.company_owner_name;
		const companyName = config.company_name;

		if (!email || !password || !name || !companyName) {
			console.log("⚠️  Company Owner credentials missing in .env file");
			return;
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		// Create company first
		const company = await prisma.company.create({
			data: {
				companyName,
				creditBalance: 10,
			},
		});

		// Create owner
		const owner = await prisma.user.create({
			data: {
				email,
				name,
				passwordHash: hashedPassword,
				role: UserRole.COMPANY_OWNER,
				status: "ACTIVE",
				companyId: company.id,
			},
		});

		console.log("✓ Company Created:", company.companyName);
		console.log("✓ Company Owner Created:", owner.email);
	} catch (error) {
		console.log("❌ Error Seeding Company Owner:", error);
	}
};

export const seedCandidate = async () => {
	try {
		const isCandidateExist = await prisma.user.findFirst({
			where: {
				role: UserRole.CANDIDATE,
			},
		});
		if (isCandidateExist) {
			console.log("✓ Candidate Already Exists");
			return;
		}

		const email = config.candidate_email;
		const password = config.candidate_password;
		const name = config.candidate_name;

		if (!email || !password || !name) {
			console.log("⚠️  Candidate credentials missing in .env file");
			return;
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const candidate = await prisma.user.create({
			data: {
				email,
				name,
				passwordHash: hashedPassword,
				role: UserRole.CANDIDATE,
				status: "ACTIVE",
				candidateProfile: {
					create: {
						headline: "Aspiring Full Stack Developer",
						skills: ["JavaScript", "React", "Node.js"],
					},
				},
			},
		});

		console.log("✓ Candidate Created:", candidate.email);
	} catch (error) {
		console.log("❌ Error Seeding Candidate:", error);
	}
};

export const seedAssessmentCreator = async () => {
	try {
		const isCreatorExist = await prisma.user.findFirst({
			where: {
				role: UserRole.ASSESSMENT_CREATOR,
			},
		});
		if (isCreatorExist) {
			console.log("✓ Assessment Creator Already Exists");
			return;
		}

		const email = config.assessment_creator_email;
		const password = config.assessment_creator_password;
		const name = config.assessment_creator_name;

		if (!email || !password || !name) {
			console.log("⚠️  Assessment Creator credentials missing in .env file");
			return;
		}

		// Get first company to assign creator to
		const company = await prisma.company.findFirst();
		if (!company) {
			console.log("⚠️  No company exists. Create Company Owner first.");
			return;
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const creator = await prisma.user.create({
			data: {
				email,
				name,
				passwordHash: hashedPassword,
				role: UserRole.ASSESSMENT_CREATOR,
				status: "ACTIVE",
				companyId: company.id,
			},
		});

		console.log("✓ Assessment Creator Created:", creator.email);
	} catch (error) {
		console.log("❌ Error Seeding Assessment Creator:", error);
	}
};

export const seedEvaluator = async () => {
	try {
		const isEvaluatorExist = await prisma.user.findFirst({
			where: {
				role: UserRole.EVALUATOR,
			},
		});
		if (isEvaluatorExist) {
			console.log("✓ Evaluator Already Exists");
			return;
		}

		const email = config.evaluator_email;
		const password = config.evaluator_password;
		const name = config.evaluator_name;

		if (!email || !password || !name) {
			console.log("⚠️  Evaluator credentials missing in .env file");
			return;
		}

		// Get first company to assign evaluator to
		const company = await prisma.company.findFirst();
		if (!company) {
			console.log("⚠️  No company exists. Create Company Owner first.");
			return;
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const evaluator = await prisma.user.create({
			data: {
				email,
				name,
				passwordHash: hashedPassword,
				role: UserRole.EVALUATOR,
				status: "ACTIVE",
				companyId: company.id,
			},
		});

		console.log("✓ Evaluator Created:", evaluator.email);
	} catch (error) {
		console.log("❌ Error Seeding Evaluator:", error);
	}
};

export const seedAllRoles = async () => {
	console.log("🌱 Starting seed...");
	await seedAdmin();
	await seedCompanyOwner();
	await seedCandidate();
	await seedAssessmentCreator();
	await seedEvaluator();
	console.log("🎉 Seed completed!");
};
