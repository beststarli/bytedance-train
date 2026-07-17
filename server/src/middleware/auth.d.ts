import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from '../utils/jwt';
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map