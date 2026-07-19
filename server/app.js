"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '../.env' });
const auth_1 = __importDefault(require("./src/routes/auth"));
const content_1 = __importDefault(require("./src/routes/content"));
const db_1 = require("./src/utils/db");
const objectStorage_1 = require("./src/utils/objectStorage");
// 启动时自动执行数据库迁移（幂等）
async function runMigrations() {
    try {
        await db_1.pool.query(`
			ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
			ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
			ALTER TABLE chats ADD COLUMN IF NOT EXISTS summary TEXT;
			CREATE TABLE IF NOT EXISTS works (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				title VARCHAR(200) NOT NULL DEFAULT '未命名作品',
				content TEXT NOT NULL DEFAULT '',
				status VARCHAR(20) NOT NULL DEFAULT 'published',
				quality_score DECIMAL(3,1),
				view_count INTEGER DEFAULT 0,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_works_status_created_at ON works(status, created_at DESC);
			CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id);
			CREATE TABLE IF NOT EXISTS work_reactions (
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
				type VARCHAR(20) NOT NULL CHECK (type IN ('like', 'favorite')),
				created_at TIMESTAMPTZ DEFAULT NOW(),
				PRIMARY KEY (user_id, work_id, type)
			);
			CREATE INDEX IF NOT EXISTS idx_work_reactions_work_id ON work_reactions(work_id);
			CREATE INDEX IF NOT EXISTS idx_work_reactions_user_id ON work_reactions(user_id);
			CREATE TABLE IF NOT EXISTS materials (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				filename VARCHAR(255) NOT NULL,
				url TEXT NOT NULL,
				type VARCHAR(20) NOT NULL DEFAULT 'image',
				size INTEGER,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_materials_user_id ON materials(user_id);
			ALTER TABLE works ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,1);
			ALTER TABLE works ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
			ALTER TABLE works ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
			ALTER TABLE works ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
			CREATE TABLE IF NOT EXISTS refresh_tokens (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				jti UUID UNIQUE NOT NULL,
				token_hash CHAR(64) UNIQUE NOT NULL,
				expires_at TIMESTAMPTZ NOT NULL,
				revoked_at TIMESTAMPTZ,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
			CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
			CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
		`);
        console.log('✓ 数据库迁移完成');
        if ((0, objectStorage_1.objectStorageConfigured)()) {
            try {
                await (0, objectStorage_1.migrateLocalUploadsToObjectStorage)();
                console.log('✓ RustFS 对象存储已连接，本地资源迁移完成');
            }
            catch (error) {
                console.error('× RustFS 连接或资源迁移失败，服务将继续启动：', error);
            }
        }
    }
    catch (err) {
        console.error('× 数据库迁移失败:', err);
        throw err;
    }
}
const app = (0, express_1.default)();
const PORT = process.env.Server_Port || 4001;
// 中间件
// Base64 会比原文件大约增加 1/3，需覆盖前端允许的 10MB 素材。
app.use(express_1.default.json({ limit: '20mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '20mb' }));
// 静态文件服务（头像等上传文件）
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, 'uploads')));
// 路由
app.get('/', (req, res) => {
    res.json({ message: 'Hello Express + TypeScript! 🚀' });
});
app.use('/api/auth', auth_1.default);
app.use('/api/content', content_1.default);
// 统一记录未被路由处理的异常，避免只返回无上下文的 HTML 500。
app.use((err, req, res, _next) => {
    const message = err instanceof Error ? err.message : '未知错误';
    console.error(`[${req.method} ${req.originalUrl}]`, err);
    if (!res.headersSent) {
        res.status(500).json({
            error: process.env.NODE_ENV === 'production' ? '服务暂时不可用' : message,
        });
    }
});
// 先完成数据库结构检查，再接收请求，避免启动阶段的迁移竞态。
async function startServer() {
    try {
        await runMigrations();
        app.listen(PORT, () => {
            console.log(`🚀 服务器运行在: http://localhost:${PORT}`);
        });
    }
    catch {
        console.error('× 服务启动终止：数据库结构未准备完成');
        process.exitCode = 1;
    }
}
void startServer();
//# sourceMappingURL=app.js.map