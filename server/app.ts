import express, { Request, Response, Application, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

import authRoutes from './src/routes/auth';
import contentRoutes from './src/routes/content';
import { pool } from './src/utils/db';

// 启动时自动执行数据库迁移（幂等）
async function runMigrations() {
	try {
		await pool.query(`
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
		`)
		console.log('✓ 数据库迁移完成')
	} catch (err) {
		console.error('× 数据库迁移失败:', err)
		throw err
	}
}

const app: Application = express();
const PORT = process.env.Server_Port || 4001;

// 中间件
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 静态文件服务（头像等上传文件）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 路由
app.get('/', (req: Request, res: Response) => {
    res.json({ message: 'Hello Express + TypeScript! 🚀' });
});

app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);

// 统一记录未被路由处理的异常，避免只返回无上下文的 HTML 500。
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
	const message = err instanceof Error ? err.message : '未知错误'
	console.error(`[${req.method} ${req.originalUrl}]`, err)
	if (!res.headersSent) {
		res.status(500).json({
			error: process.env.NODE_ENV === 'production' ? '服务暂时不可用' : message,
		})
	}
})

// 先完成数据库结构检查，再接收请求，避免启动阶段的迁移竞态。
async function startServer() {
	try {
		await runMigrations()
		app.listen(PORT, () => {
			console.log(`🚀 服务器运行在: http://localhost:${PORT}`)
		})
	} catch {
		console.error('× 服务启动终止：数据库结构未准备完成')
		process.exitCode = 1
	}
}

void startServer()
