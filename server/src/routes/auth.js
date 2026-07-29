"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = require("crypto");
const db_1 = require("../utils/db");
const objectStorage_1 = require("../utils/objectStorage");
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
// 获取当前用户信息（用于前端刷新后恢复登录态）
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { rows } = await db_1.pool.query('SELECT id, phone, email, nickname, avatar_url FROM users WHERE id = $1', [userId]);
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
        const normalizedNickname = String(nickname).trim();
        const { rows: duplicateRows } = await db_1.pool.query('SELECT id FROM users WHERE LOWER(nickname) = LOWER($1) AND id <> $2 LIMIT 1', [normalizedNickname, userId]);
        if (duplicateRows[0]) {
            res.status(409).json({ error: '该昵称已被其他用户使用' });
            return;
        }
        updates.push(`nickname = $${idx++}`);
        values.push(normalizedNickname);
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
        // 删除旧头像文件
        const { rows: old } = await db_1.pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
        await (0, objectStorage_1.deleteUpload)(old[0]?.avatar_url);
        const avatarUrl = await (0, objectStorage_1.saveUpload)(`avatars/${filename}`, buffer, `image/${matches[1]}`);
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
    const { new_password, confirm_password } = req.body;
    if (!new_password || new_password.length < 6) {
        res.status(400).json({ error: '密码至少6位' });
        return;
    }
    if (new_password !== confirm_password) {
        res.status(400).json({ error: '两次输入的密码不一致' });
        return;
    }
    try {
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
router.post('/register', async (req, res) => {
    const nickname = String(req.body.nickname || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirm_password || '');
    if (nickname.length < 2 || nickname.length > 50) {
        res.status(400).json({ error: '昵称长度应为 2 至 50 个字符' });
        return;
    }
    if (!/^1\d{10}$/.test(phone)) {
        res.status(400).json({ error: '手机号格式不正确' });
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: '邮箱格式不正确' });
        return;
    }
    if (password.length < 6) {
        res.status(400).json({ error: '密码至少 6 位' });
        return;
    }
    if (password !== confirmPassword) {
        res.status(400).json({ error: '两次输入的密码不一致' });
        return;
    }
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('user-registration'))`);
        const { rows: duplicates } = await client.query(`SELECT
				EXISTS(SELECT 1 FROM users WHERE phone = $1) AS phone_exists,
				EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER($2)) AS email_exists,
				EXISTS(SELECT 1 FROM users WHERE LOWER(nickname) = LOWER($3)) AS nickname_exists`, [phone, email, nickname]);
        if (duplicates[0].nickname_exists) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: '该昵称已被注册' });
            return;
        }
        if (duplicates[0].phone_exists) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: '该手机号已被注册' });
            return;
        }
        if (duplicates[0].email_exists) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: '该邮箱已被注册' });
            return;
        }
        const salt = (0, crypto_1.randomBytes)(16).toString('hex');
        const hash = (0, crypto_1.scryptSync)(password, salt, 64).toString('hex');
        const { rows } = await client.query(`INSERT INTO users (nickname, phone, email, password_hash)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, phone, email, nickname, avatar_url`, [nickname, phone, email, `${salt}:${hash}`]);
        await client.query('COMMIT');
        const user = rows[0];
        const accessToken = await createSession(user, res);
        res.status(201).json({ accessToken, user });
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (err?.code === '23505') {
            res.status(409).json({ error: '昵称、手机号或邮箱已被注册' });
            return;
        }
        console.error('注册失败:', err);
        res.status(500).json({ error: '注册失败' });
    }
    finally {
        client.release();
    }
});
router.post('/login-password', async (req, res) => {
    const { account, password } = req.body;
    if (!account || !password) {
        res.status(400).json({ error: '账号和密码不能为空' });
        return;
    }
    try {
        const { rows } = await db_1.pool.query('SELECT * FROM users WHERE phone = $1 OR LOWER(email) = LOWER($1)', [account]);
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