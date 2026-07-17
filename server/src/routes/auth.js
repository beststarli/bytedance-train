"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../utils/db");
const jwt_1 = require("../utils/jwt");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const REFRESH_COOKIE = 'refresh_token';
const isProduction = process.env.NODE_ENV === 'production';
function hashToken(token) {
    return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
}
function readCookie(req, name) {
    const cookies = req.headers.cookie?.split(';') ?? [];
    for (const cookie of cookies) {
        const [key, ...value] = cookie.trim().split('=');
        if (key === name)
            return decodeURIComponent(value.join('='));
    }
    return undefined;
}
function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE, token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/api/auth',
        expires: (0, jwt_1.getRefreshTokenExpiresAt)(token),
    });
}
function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/api/auth',
    });
}
async function createSession(user, res) {
    const accessToken = (0, jwt_1.signAccessToken)({ userId: user.id, phone: user.phone });
    const { token: refreshToken, jti } = (0, jwt_1.signRefreshToken)({ userId: user.id, phone: user.phone });
    await db_1.pool.query(`INSERT INTO refresh_tokens (user_id, jti, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4)`, [user.id, jti, hashToken(refreshToken), (0, jwt_1.getRefreshTokenExpiresAt)(refreshToken)]);
    setRefreshCookie(res, refreshToken);
    return accessToken;
}
// 生成 6 位随机验证码
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// 发送验证码
router.post('/send-code', async (req, res) => {
    const { phone } = req.body;
    console.log(req.body);
    if (!phone || !/^1\d{10}$/.test(phone)) {
        res.status(400).json({ error: '手机号格式不正确' });
        return;
    }
    try {
        // 检查 60s 内是否已发过
        const { rows: recent } = await db_1.pool.query(`SELECT created_at FROM verification
       WHERE phone = $1 AND type = 'login' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`, [phone]);
        if (recent[0]) {
            const elapsed = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
            if (elapsed < 60) {
                res.status(429).json({ error: `请 ${Math.ceil(60 - elapsed)} 秒后再试` });
                return;
            }
        }
        const code = generateCode();
        await db_1.pool.query(`INSERT INTO verification (phone, code, type, expires_at)
       VALUES ($1, $2, 'login', NOW() + INTERVAL '5 minutes')`, [phone, code]);
        // 开发阶段打印到控制台，后续接入腾讯云短信 SDK
        console.log(`[DEV] 验证码发送至 ${phone}: ${code}`);
        res.json({ message: '发送成功' });
    }
    catch (err) {
        console.error('发送验证码失败:', err);
        res.status(500).json({ error: '发送失败' });
    }
});
// 验证码登录（自动注册）
router.post('/login', async (req, res) => {
    const { phone, code } = req.body;
    if (!phone || !code) {
        res.status(400).json({ error: '手机号和验证码不能为空' });
        return;
    }
    try {
        // 校验验证码
        const { rows: codes } = await db_1.pool.query(`SELECT id, code, expires_at FROM verification
       WHERE phone = $1 AND type = 'login' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`, [phone]);
        const record = codes[0];
        if (!record) {
            res.status(400).json({ error: '请先获取验证码' });
            return;
        }
        if (new Date(record.expires_at) < new Date()) {
            res.status(400).json({ error: '验证码已过期' });
            return;
        }
        if (record.code !== code) {
            res.status(400).json({ error: '验证码不正确' });
            return;
        }
        // 标记验证码已使用
        await db_1.pool.query('UPDATE verification SET used_at = NOW() WHERE id = $1', [record.id]);
        // 查用户，不存在则自动注册
        let { rows: users } = await db_1.pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
        let isNewUser = false;
        if (users.length === 0) {
            isNewUser = true;
            const { rows: newUser } = await db_1.pool.query(`INSERT INTO users (phone) VALUES ($1) RETURNING *`, [phone]);
            users = newUser;
        }
        const user = users[0];
        // 更新最后登录时间
        await db_1.pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
        // 生成 token
        const accessToken = await createSession(user, res);
        res.json({
            accessToken,
            user: {
                id: user.id,
                phone: user.phone,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
            },
            is_new_user: isNewUser,
        });
    }
    catch (err) {
        console.error('登录失败:', err);
        res.status(500).json({ error: '登录失败' });
    }
});
// 获取当前用户信息（用于前端刷新后恢复登录态）
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { rows } = await db_1.pool.query('SELECT id, phone, nickname, avatar_url FROM users WHERE id = $1', [userId]);
    if (!rows[0]) {
        res.status(404).json({ error: '用户不存在' });
        return;
    }
    res.json({ user: rows[0] });
});
// 更新用户资料
router.put('/profile', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { nickname, email, avatar_url } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;
    if (nickname !== undefined) {
        updates.push(`nickname = $${idx++}`);
        values.push(nickname);
    }
    if (email !== undefined) {
        updates.push(`email = $${idx++}`);
        values.push(email);
    }
    if (avatar_url !== undefined) {
        updates.push(`avatar_url = $${idx++}`);
        values.push(avatar_url);
    }
    if (updates.length === 0) {
        res.status(400).json({ error: '没有需要更新的字段' });
        return;
    }
    values.push(userId);
    try {
        const { rows } = await db_1.pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, phone, email, nickname, avatar_url`, values);
        res.json({ user: rows[0] });
    }
    catch (err) {
        console.error('更新资料失败:', err);
        res.status(500).json({ error: '更新失败' });
    }
});
// 上传头像（base64）
router.post('/avatar', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { image } = req.body;
    if (!image || !image.startsWith('data:image/')) {
        res.status(400).json({ error: '图片格式不正确' });
        return;
    }
    try {
        // 解析 base64
        const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
            res.status(400).json({ error: '图片数据解析失败' });
            return;
        }
        const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `avatar_${userId}_${Date.now()}.${ext}`;
        const uploadDir = path_1.default.join(__dirname, '../../uploads');
        // 确保 uploads 目录存在
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        fs_1.default.writeFileSync(path_1.default.join(uploadDir, filename), buffer);
        // 删除旧头像文件
        const { rows: old } = await db_1.pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
        if (old[0]?.avatar_url) {
            const oldPath = path_1.default.join(uploadDir, path_1.default.basename(old[0].avatar_url));
            if (fs_1.default.existsSync(oldPath))
                fs_1.default.unlinkSync(oldPath);
        }
        const avatarUrl = `/uploads/${filename}`;
        const { rows } = await db_1.pool.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, phone, email, nickname, avatar_url', [avatarUrl, userId]);
        res.json({ user: rows[0] });
    }
    catch (err) {
        console.error('上传头像失败:', err);
        res.status(500).json({ error: '上传失败' });
    }
});
// 设置/修改密码
router.put('/password', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { old_password, new_password } = req.body;
    if (!new_password || new_password.length < 6) {
        res.status(400).json({ error: '密码至少6位' });
        return;
    }
    try {
        const { rows } = await db_1.pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        const user = rows[0];
        // 如果已有密码，需要验证旧密码
        if (user.password_hash) {
            if (!old_password) {
                res.status(400).json({ error: '请输入当前密码' });
                return;
            }
            const [salt, key] = user.password_hash.split(':');
            const oldHash = (0, crypto_1.scryptSync)(old_password, salt, 64).toString('hex');
            if (!(0, crypto_1.timingSafeEqual)(Buffer.from(key), Buffer.from(oldHash))) {
                res.status(400).json({ error: '当前密码不正确' });
                return;
            }
        }
        const salt = (0, crypto_1.randomBytes)(16).toString('hex');
        const hash = (0, crypto_1.scryptSync)(new_password, salt, 64).toString('hex');
        await db_1.pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [`${salt}:${hash}`, userId]);
        res.json({ message: '密码设置成功' });
    }
    catch (err) {
        console.error('设置密码失败:', err);
        res.status(500).json({ error: '设置失败' });
    }
});
// 密码登录
router.post('/login-password', async (req, res) => {
    const { account, password } = req.body;
    if (!account || !password) {
        res.status(400).json({ error: '账号和密码不能为空' });
        return;
    }
    try {
        const { rows } = await db_1.pool.query('SELECT * FROM users WHERE phone = $1 OR email = $1', [account]);
        const user = rows[0];
        if (!user || !user.password_hash) {
            res.status(400).json({ error: '账号或密码错误' });
            return;
        }
        const [salt, key] = user.password_hash.split(':');
        const hash = (0, crypto_1.scryptSync)(password, salt, 64).toString('hex');
        if (!(0, crypto_1.timingSafeEqual)(Buffer.from(key), Buffer.from(hash))) {
            res.status(400).json({ error: '账号或密码错误' });
            return;
        }
        await db_1.pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
        const accessToken = await createSession(user, res);
        res.json({
            accessToken,
            user: {
                id: user.id,
                phone: user.phone,
                email: user.email,
                nickname: user.nickname,
                avatar_url: user.avatar_url,
            },
        });
    }
    catch (err) {
        console.error('密码登录失败:', err);
        res.status(500).json({ error: '登录失败' });
    }
});
// Refresh Token 轮换：旧令牌只可使用一次。
router.post('/refresh', async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (!refreshToken) {
        res.status(401).json({ error: '登录已过期，请重新登录' });
        return;
    }
    const client = await db_1.pool.connect();
    try {
        const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT id, user_id FROM refresh_tokens
			 WHERE jti = $1 AND token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()
			 FOR UPDATE`, [payload.jti, hashToken(refreshToken)]);
        if (!rows[0]) {
            await client.query('ROLLBACK');
            clearRefreshCookie(res);
            res.status(401).json({ error: '会话无效，请重新登录' });
            return;
        }
        await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [rows[0].id]);
        const { rows: users } = await client.query('SELECT id, phone, email, nickname, avatar_url FROM users WHERE id = $1 AND status = $2', [payload.userId, 'active']);
        const user = users[0];
        if (!user) {
            await client.query('ROLLBACK');
            clearRefreshCookie(res);
            res.status(401).json({ error: '用户不存在或已停用' });
            return;
        }
        const accessToken = (0, jwt_1.signAccessToken)({ userId: user.id, phone: user.phone });
        const nextRefresh = (0, jwt_1.signRefreshToken)({ userId: user.id, phone: user.phone });
        await client.query(`INSERT INTO refresh_tokens (user_id, jti, token_hash, expires_at)
			 VALUES ($1, $2, $3, $4)`, [user.id, nextRefresh.jti, hashToken(nextRefresh.token), (0, jwt_1.getRefreshTokenExpiresAt)(nextRefresh.token)]);
        await client.query('COMMIT');
        setRefreshCookie(res, nextRefresh.token);
        res.json({ accessToken, user });
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        clearRefreshCookie(res);
        console.error('刷新 token 失败:', err);
        res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    finally {
        client.release();
    }
});
router.post('/logout', async (req, res) => {
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (refreshToken) {
        await db_1.pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(refreshToken)]).catch((err) => console.error('撤销 refresh token 失败:', err));
    }
    clearRefreshCookie(res);
    res.json({ message: '已退出登录' });
});
exports.default = router;
//# sourceMappingURL=auth.js.map