"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = void 0;
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.getRefreshTokenExpiresAt = getRefreshTokenExpiresAt;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-access-secret';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-secret';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const accessOptions = { expiresIn: ACCESS_TOKEN_EXPIRY };
const refreshOptions = { expiresIn: REFRESH_TOKEN_EXPIRY };
function signAccessToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, type: 'access' }, ACCESS_SECRET, accessOptions);
}
function signRefreshToken(payload) {
    const jti = (0, crypto_1.randomUUID)();
    const token = jsonwebtoken_1.default.sign({ ...payload, jti, type: 'refresh' }, REFRESH_SECRET, refreshOptions);
    return { token, jti };
}
function verifyAccessToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
    if (payload.type !== 'access')
        throw new Error('令牌类型错误');
    return payload;
}
function verifyRefreshToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
    if (payload.type !== 'refresh' || !payload.jti)
        throw new Error('令牌类型错误');
    return payload;
}
// 兼容现有调用方；这里只验证短期 Access Token。
exports.verifyToken = verifyAccessToken;
function getRefreshTokenExpiresAt(token) {
    const decoded = jsonwebtoken_1.default.decode(token);
    if (!decoded?.exp)
        throw new Error('Refresh Token 缺少过期时间');
    return new Date(decoded.exp * 1000);
}
//# sourceMappingURL=jwt.js.map