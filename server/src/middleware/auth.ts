import { Request, Response, NextFunction } from 'express'
import { verifyToken, JwtPayload } from '../utils/jwt'

declare global {
	namespace Express {
		interface Request {
			user?: JwtPayload
		}
	}
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
	const header = req.headers.authorization
	if (!header?.startsWith('Bearer ')) {
		res.status(401).json({ error: '未登录' })
		return
	}

	try {
		req.user = verifyToken(header.slice(7))
		next()
	} catch {
		res.status(401).json({ error: 'token 已过期或无效' })
	}
}
