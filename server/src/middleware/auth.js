"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const jwt_1 = require("../utils/jwt");
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: '未登录' });
        return;
    }
    try {
        req.user = (0, jwt_1.verifyToken)(header.slice(7));
        next();
    }
    catch {
        res.status(401).json({ error: 'token 已过期或无效' });
    }
}
//# sourceMappingURL=auth.js.map