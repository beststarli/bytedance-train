import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-access-secret'
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-secret'
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m'
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d'
const accessOptions = { expiresIn: ACCESS_TOKEN_EXPIRY } as jwt.SignOptions
const refreshOptions = { expiresIn: REFRESH_TOKEN_EXPIRY } as jwt.SignOptions

export interface JwtPayload {
	userId: string
	phone: string
}

export interface RefreshJwtPayload extends JwtPayload {
	jti: string
	type: 'refresh'
}

export function signAccessToken(payload: JwtPayload) {
	return jwt.sign({ ...payload, type: 'access' }, ACCESS_SECRET, accessOptions)
}

export function signRefreshToken(payload: JwtPayload) {
	const jti = randomUUID()
	const token = jwt.sign({ ...payload, jti, type: 'refresh' }, REFRESH_SECRET, refreshOptions)
	return { token, jti }
}

export function verifyAccessToken(token: string) {
	const payload = jwt.verify(token, ACCESS_SECRET) as JwtPayload & { type?: string }
	if (payload.type !== 'access') throw new Error('令牌类型错误')
	return payload
}

export function verifyRefreshToken(token: string) {
	const payload = jwt.verify(token, REFRESH_SECRET) as RefreshJwtPayload
	if (payload.type !== 'refresh' || !payload.jti) throw new Error('令牌类型错误')
	return payload
}

// 兼容现有调用方；这里只验证短期 Access Token。
export const verifyToken = verifyAccessToken

export function getRefreshTokenExpiresAt(token: string) {
	const decoded = jwt.decode(token) as jwt.JwtPayload | null
	if (!decoded?.exp) throw new Error('Refresh Token 缺少过期时间')
	return new Date(decoded.exp * 1000)
}
