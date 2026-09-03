import type { Secret, SignOptions } from "jsonwebtoken";
import jwt, { type JwtPayload } from "jsonwebtoken";

const createToken = (
	payload: JwtPayload,
	secret: Secret,
	expiresIn: string | number | undefined,
) => {
	const options: SignOptions = expiresIn
		? { expiresIn: expiresIn as SignOptions["expiresIn"] }
		: {};
	const token = jwt.sign(payload, secret, options);
	return token;
};

const verifyToken = (token: string, secret: Secret) => {
	try {
		const verifiedToken = jwt.verify(token, secret);
		return {
			success: true,
			data: verifiedToken,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Token verification failed";
		return {
			success: false,
			error: errorMessage,
		};
	}
};

export const jwtUtils = {
	createToken,
	verifyToken,
};
