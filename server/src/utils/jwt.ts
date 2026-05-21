import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev-secret'

export interface JwtPayload {
	userId: string
	phone: string
}

export function signToken(payload: JwtPayload) {
	return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string) {
	return jwt.verify(token, SECRET) as JwtPayload
}
