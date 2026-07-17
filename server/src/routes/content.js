"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../utils/db");
const jwt_1 = require("../utils/jwt");
const ai_1 = require("../utils/ai");
const context_1 = require("../utils/context");
const router = (0, express_1.Router)();
// 认证中间件
function auth(req, res) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: '未登录' });
        return null;
    }
    try {
        return (0, jwt_1.verifyToken)(header.slice(7)).userId;
    }
    catch {
        res.status(401).json({ error: 'token 已过期或无效' });
        return null;
    }
}
function optionalUserId(req) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
        return null;
    try {
        return (0, jwt_1.verifyToken)(header.slice(7)).userId;
    }
    catch {
        return null;
    }
}
// ==================== Chats ====================
// 获取用户的聊天列表
router.get('/chats', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { rows } = await db_1.pool.query('SELECT id, title, created_at, updated_at FROM chats WHERE user_id = $1 ORDER BY updated_at DESC', [userId]);
    res.json({ chats: rows });
});
// 创建新聊天
router.post('/chats', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { title } = req.body;
    const { rows } = await db_1.pool.query('INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at, updated_at', [userId, title || '新对话']);
    res.json({ chat: rows[0] });
});
// 删除聊天
router.delete('/chats/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    await db_1.pool.query('DELETE FROM chats WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    res.json({ message: '已删除' });
});
// 更新聊天标题
router.patch('/chats/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { title } = req.body;
    const { rows } = await db_1.pool.query('UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id, title, created_at, updated_at', [title, req.params.id, userId]);
    res.json({ chat: rows[0] });
});
// ==================== Messages ====================
// 获取聊天的消息列表
router.get('/chats/:id/messages', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { rows } = await db_1.pool.query(`SELECT m.id, m.role, m.content, m.created_at
		 FROM messages m JOIN chats c ON m.chat_id = c.id
		 WHERE m.chat_id = $1 AND c.user_id = $2
		 ORDER BY m.created_at ASC`, [req.params.id, userId]);
    res.json({ messages: rows });
});
// 发送消息
router.post('/chats/:id/messages', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { content } = req.body;
    if (!content?.trim()) {
        res.status(400).json({ error: '消息不能为空' });
        return;
    }
    const { rows: chatRows } = await db_1.pool.query('SELECT id FROM chats WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (!chatRows[0]) {
        res.status(404).json({ error: '聊天不存在' });
        return;
    }
    const { rows: msgRows } = await db_1.pool.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at', [req.params.id, 'user', content]);
    await db_1.pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: msgRows[0] });
});
// ==================== AI 生成（JSON 响应，向后兼容） ====================
router.post('/chats/:id/generate', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { content, model_type } = req.body;
    if (!content?.trim()) {
        res.status(400).json({ error: '消息不能为空' });
        return;
    }
    const { rows: chatRows } = await db_1.pool.query('SELECT id, title FROM chats WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (!chatRows[0]) {
        res.status(404).json({ error: '聊天不存在' });
        return;
    }
    const { rows: userMsg } = await db_1.pool.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at', [req.params.id, 'user', content]);
    const modelType = model_type && ['text', 'image', 'video'].includes(model_type)
        ? model_type
        : (0, ai_1.detectModelType)(content);
    let aiContent;
    switch (modelType) {
        case 'image': {
            const urls = await (0, ai_1.generateImage)(content);
            aiContent = urls[0] || '图片生成失败';
            break;
        }
        case 'video': {
            const { task_id } = await (0, ai_1.generateVideo)(content);
            aiContent = `视频生成任务已提交，任务 ID: ${task_id}`;
            break;
        }
        default: {
            const { rows: history } = await db_1.pool.query(`SELECT role, content FROM messages
				 WHERE chat_id = $1 AND id != $2
				 ORDER BY created_at ASC`, [req.params.id, userMsg[0].id]);
            const messages = history.map((m) => ({
                role: m.role,
                content: m.content,
            }));
            const finalMessages = (0, context_1.buildMessages)(messages, { role: 'user', content });
            const totalTokens = finalMessages.reduce((sum, m) => sum + (0, context_1.countTokens)(m.content), 0);
            console.log(`[Chat ${req.params.id}] ${finalMessages.length} messages, ~${totalTokens} tokens`);
            aiContent = await (0, ai_1.chatCompletion)(finalMessages);
            const { truncatedCount } = (0, context_1.truncateToTokenLimit)(messages, context_1.DEFAULT_TEXT_CONFIG);
            if (truncatedCount > 0) {
                console.log(`[Chat ${req.params.id}] Truncated ${truncatedCount} old messages`);
            }
        }
    }
    const { rows: aiMsg } = await db_1.pool.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at', [req.params.id, 'assistant', aiContent]);
    if (chatRows[0].title === '新对话') {
        const shortTitle = content.length > 30 ? content.slice(0, 30) + '…' : content;
        await db_1.pool.query('UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2', [shortTitle, req.params.id]);
    }
    else {
        await db_1.pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    }
    res.json({ user_message: userMsg[0], ai_message: aiMsg[0], model_type: modelType });
});
// ==================== AI 生成（SSE 流式，文生文/图/视频通用） ====================
router.post('/chats/:id/generate-stream', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { content, model_type } = req.body;
    if (!content?.trim()) {
        res.status(400).json({ error: '消息不能为空' });
        return;
    }
    const { rows: chatRows } = await db_1.pool.query('SELECT id, title, summary FROM chats WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (!chatRows[0]) {
        res.status(404).json({ error: '聊天不存在' });
        return;
    }
    // 存用户消息
    const { rows: userMsg } = await db_1.pool.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at', [req.params.id, 'user', content]);
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Disable Nagle to prevent TCP buffering of small SSE chunks
    req.socket?.setNoDelay(true);
    res.flushHeaders();
    // Send user message event
    res.write(`data: ${JSON.stringify({ type: 'user_message', message: userMsg[0] })}\n\n`);
    try {
        const modelType = model_type && ['text', 'image', 'video'].includes(model_type)
            ? model_type
            : (0, ai_1.detectModelType)(content);
        let fullContent = '';
        switch (modelType) {
            case 'image': {
                const urls = await (0, ai_1.generateImage)(content);
                fullContent = urls[0] || '图片生成失败';
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: fullContent })}\n\n`);
                break;
            }
            case 'video': {
                const { task_id } = await (0, ai_1.generateVideo)(content);
                fullContent = `视频生成任务已提交，任务 ID: ${task_id}`;
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: fullContent })}\n\n`);
                break;
            }
            default: {
                const { rows: history } = await db_1.pool.query(`SELECT role, content FROM messages
					 WHERE chat_id = $1 AND id != $2
					 ORDER BY created_at ASC`, [req.params.id, userMsg[0].id]);
                const messages = history.map((m) => ({
                    role: m.role,
                    content: m.content,
                }));
                const summary = chatRows[0].summary || undefined;
                const finalMessages = (0, context_1.buildMessages)(messages, { role: 'user', content }, { summary });
                const totalTokens = finalMessages.reduce((sum, m) => sum + (0, context_1.countTokens)(m.content), 0);
                console.log(`[Stream ${req.params.id}] ${finalMessages.length} messages, ~${totalTokens} tokens`);
                const stream = (0, ai_1.chatCompletionStream)(finalMessages);
                for await (const chunk of stream) {
                    fullContent += chunk;
                    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
                }
                // 触发摘要（不阻塞响应）
                const { truncatedCount } = (0, context_1.truncateToTokenLimit)(messages, context_1.DEFAULT_TEXT_CONFIG);
                if (truncatedCount > 2) {
                    (0, ai_1.chatSummary)(messages, summary).then((newSummary) => {
                        db_1.pool.query('UPDATE chats SET summary = $1 WHERE id = $2', [newSummary, req.params.id])
                            .catch((err) => console.error('[Summary] save failed:', err));
                    });
                }
            }
        }
        // 存 AI 消息
        const { rows: aiMsg } = await db_1.pool.query('INSERT INTO messages (chat_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at', [req.params.id, 'assistant', fullContent]);
        // 更新标题
        if (chatRows[0].title === '新对话') {
            const shortTitle = content.length > 30 ? content.slice(0, 30) + '…' : content;
            await db_1.pool.query('UPDATE chats SET title = $1, updated_at = NOW() WHERE id = $2', [shortTitle, req.params.id]);
        }
        else {
            await db_1.pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [req.params.id]);
        }
        res.write(`data: ${JSON.stringify({ type: 'done', message: aiMsg[0] })}\n\n`);
    }
    catch (err) {
        console.error('[Stream] Error:', err);
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message || '生成失败' })}\n\n`);
    }
    finally {
        res.end();
    }
});
// ==================== Prompts CRUD ====================
router.get('/prompts', async (_req, res) => {
    const { rows } = await db_1.pool.query('SELECT id, title, description, content, category, icon, sort_order, is_active, created_at FROM prompts ORDER BY sort_order ASC, created_at ASC');
    res.json({ prompts: rows });
});
router.post('/prompts', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { title, description, content, category, icon } = req.body;
    if (!title || !content) {
        res.status(400).json({ error: '标题和内容不能为空' });
        return;
    }
    const { rows } = await db_1.pool.query('INSERT INTO prompts (title, description, content, category, icon) VALUES ($1, $2, $3, $4, $5) RETURNING *', [title, description || '', content, category || 'general', icon || 'FileText']);
    res.json({ prompt: rows[0] });
});
router.put('/prompts/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { title, description, content, category, icon, sort_order, is_active } = req.body;
    const { rows } = await db_1.pool.query('UPDATE prompts SET title = COALESCE($1, title), description = COALESCE($2, description), content = COALESCE($3, content), category = COALESCE($4, category), icon = COALESCE($5, icon), sort_order = COALESCE($6, sort_order), is_active = COALESCE($7, is_active) WHERE id = $8 RETURNING *', [title, description, content, category, icon, sort_order, is_active, req.params.id]);
    res.json({ prompt: rows[0] || null });
});
router.delete('/prompts/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    await db_1.pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id]);
    res.json({ message: '已删除' });
});
// ==================== Works ====================
router.get('/works', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { rows } = await db_1.pool.query(`SELECT w.id, w.title, w.content, w.status, w.quality_score, w.view_count, w.created_at, w.updated_at,
			 COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
			 COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count
		 FROM works w
		 LEFT JOIN work_reactions r ON r.work_id = w.id
		 WHERE w.user_id = $1
		 GROUP BY w.id
		 ORDER BY w.updated_at DESC`, [userId]);
    res.json({ works: rows });
});
router.post('/works', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { title, content, status } = req.body;
    const { rows } = await db_1.pool.query('INSERT INTO works (user_id, title, content, status) VALUES ($1, $2, $3, $4) RETURNING *', [userId, title || '未命名作品', content || '', status || 'published']);
    res.json({ work: rows[0] });
});
router.put('/works/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { title, content, status } = req.body;
    const { rows } = await db_1.pool.query('UPDATE works SET title = COALESCE($1, title), content = COALESCE($2, content), status = COALESCE($3, status), updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *', [title, content, status, req.params.id, userId]);
    res.json({ work: rows[0] || null });
});
router.delete('/works/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    await db_1.pool.query('DELETE FROM works WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    res.json({ message: '已删除' });
});
// ==================== Materials ====================
router.get('/materials', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { rows } = await db_1.pool.query('SELECT id, filename, url, type, size, created_at FROM materials WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json({ materials: rows });
});
router.post('/materials', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { filename, data, type } = req.body;
    if (!data) {
        res.status(400).json({ error: '文件数据不能为空' });
        return;
    }
    try {
        const matches = data.match(/^data:(image\/\w+|video\/\w+|audio\/\w+);base64,(.+)$/);
        if (!matches) {
            res.status(400).json({ error: '文件格式不正确' });
            return;
        }
        const mime = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const ext = filename?.split('.').pop() || (mime.includes('image') ? 'png' : mime.includes('video') ? 'mp4' : 'mp3');
        const savedName = `mat_${userId}_${Date.now()}.${ext}`;
        const uploadDir = path_1.default.join(__dirname, '../../uploads');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        fs_1.default.writeFileSync(path_1.default.join(uploadDir, savedName), buffer);
        const url = `/uploads/${savedName}`;
        const fileType = type || (mime.includes('image') ? 'image' : mime.includes('video') ? 'video' : 'other');
        const { rows } = await db_1.pool.query('INSERT INTO materials (user_id, filename, url, type, size) VALUES ($1, $2, $3, $4, $5) RETURNING *', [userId, filename || savedName, url, fileType, buffer.length]);
        res.json({ material: rows[0] });
    }
    catch (err) {
        console.error('上传素材失败:', err);
        res.status(500).json({ error: '上传失败' });
    }
});
router.delete('/materials/:id', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { rows } = await db_1.pool.query('SELECT url FROM materials WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (rows[0]?.url) {
        const filePath = path_1.default.join(__dirname, '../../uploads', path_1.default.basename(rows[0].url));
        if (fs_1.default.existsSync(filePath))
            fs_1.default.unlinkSync(filePath);
    }
    await db_1.pool.query('DELETE FROM materials WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    res.json({ message: '已删除' });
});
// ==================== Public Feed ====================
router.get('/feed', async (req, res) => {
    const userId = optionalUserId(req);
    const allowedSorts = new Set(['hot', 'new', 'quality']);
    const requestedSort = req.query.sort || 'hot';
    const sort = allowedSorts.has(requestedSort) ? requestedSort : 'hot';
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);
    const offset = Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0);
    let orderBy = 'w.view_count DESC, w.created_at DESC';
    if (sort === 'new')
        orderBy = 'w.created_at DESC';
    else if (sort === 'quality')
        orderBy = 'w.quality_score DESC NULLS LAST, w.view_count DESC';
    const { rows } = await db_1.pool.query(`SELECT w.id, w.title, w.content, w.quality_score, w.view_count, w.created_at,
				u.nickname, u.avatar_url,
				COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count,
				COALESCE(BOOL_OR(r.user_id = $3 AND r.type = 'like'), false) AS liked,
				COALESCE(BOOL_OR(r.user_id = $3 AND r.type = 'favorite'), false) AS favorited
		 FROM works w JOIN users u ON w.user_id = u.id
		 LEFT JOIN work_reactions r ON r.work_id = w.id
		 WHERE w.status = 'published'
		 GROUP BY w.id, u.id
		 ORDER BY ${orderBy}
		 LIMIT $1 OFFSET $2`, [limit, offset, userId]);
    const { rows: countRows } = await db_1.pool.query("SELECT COUNT(*) as total FROM works WHERE status = 'published'");
    res.json({ works: rows, total: parseInt(countRows[0].total), has_more: offset + limit < parseInt(countRows[0].total) });
});
router.get('/feed/:id', async (req, res) => {
    const userId = optionalUserId(req);
    const { rows } = await db_1.pool.query(`UPDATE works SET view_count = view_count + 1
		 WHERE id = $1 AND status = 'published'
		 RETURNING id`, [req.params.id]);
    if (!rows[0]) {
        res.status(404).json({ error: '文章不存在' });
        return;
    }
    const { rows: articles } = await db_1.pool.query(`SELECT w.id, w.title, w.content, w.quality_score, w.view_count, w.created_at,
				u.nickname, u.avatar_url,
				COUNT(*) FILTER (WHERE r.type = 'like')::int AS like_count,
				COUNT(*) FILTER (WHERE r.type = 'favorite')::int AS favorite_count,
				COALESCE(BOOL_OR(r.user_id = $2 AND r.type = 'like'), false) AS liked,
				COALESCE(BOOL_OR(r.user_id = $2 AND r.type = 'favorite'), false) AS favorited
		 FROM works w JOIN users u ON w.user_id = u.id
		 LEFT JOIN work_reactions r ON r.work_id = w.id
		 WHERE w.id = $1
		 GROUP BY w.id, u.id`, [req.params.id, userId]);
    res.json({ work: articles[0] });
});
router.post('/feed/:id/reactions', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { type } = req.body;
    if (!['like', 'favorite'].includes(type)) {
        res.status(400).json({ error: '不支持的互动类型' });
        return;
    }
    const deleted = await db_1.pool.query('DELETE FROM work_reactions WHERE user_id = $1 AND work_id = $2 AND type = $3 RETURNING type', [userId, req.params.id, type]);
    let active = false;
    if (!deleted.rows[0]) {
        await db_1.pool.query('INSERT INTO work_reactions (user_id, work_id, type) VALUES ($1, $2, $3)', [userId, req.params.id, type]);
        active = true;
    }
    res.json({ active });
});
router.get('/creator-dashboard', async (req, res) => {
    const userId = auth(req, res);
    if (!userId)
        return;
    const { rows: stats } = await db_1.pool.query(`SELECT COUNT(*)::int AS works,
				COALESCE(SUM(view_count), 0)::int AS views,
				COUNT(*) FILTER (WHERE status = 'published')::int AS published,
				COALESCE(ROUND(AVG(quality_score), 1), 0) AS quality
		 FROM works WHERE user_id = $1`, [userId]);
    const { rows: reactions } = await db_1.pool.query(`SELECT w.id, w.title, w.content, w.view_count, wr.type, wr.created_at
		 FROM work_reactions wr JOIN works w ON w.id = wr.work_id
		 WHERE wr.user_id = $1 ORDER BY wr.created_at DESC LIMIT 12`, [userId]);
    res.json({ stats: stats[0], reactions });
});
router.get('/hot-news', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const apiKey = process.env.GNEWS_API_KEY;
    if (!apiKey) {
        res.json({ articles: [], configured: false });
        return;
    }
    const url = new URL('https://gnews.io/api/v4/top-headlines');
    url.searchParams.set('category', 'general');
    url.searchParams.set('lang', 'zh');
    url.searchParams.set('country', 'cn');
    url.searchParams.set('max', '8');
    url.searchParams.set('apikey', apiKey);
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`热点新闻服务响应异常：${response.status}`);
    const data = await response.json();
    res.json({ articles: data.articles || [], configured: true });
});
exports.default = router;
//# sourceMappingURL=content.js.map