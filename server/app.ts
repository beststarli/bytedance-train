import express, { Request, Response, Application, NextFunction } from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

import authRoutes from './src/routes/auth';
import contentRoutes from './src/routes/content';
import { runMigrations } from './src/utils/migrations';
import { pool } from './src/utils/db';
import { resumeReviewJobs } from './src/agents/review-service';
import { initializeAgentStore, migrateLegacyAgentData } from './src/agents/core/agent-store';

const app: Application = express();
const PORT = process.env.Server_Port || 4001;

// 中间件
// Base64 会比原文件大约增加 1/3，需覆盖前端允许的 10MB 素材。
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 静态文件服务（头像等上传文件）
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 路由
app.get('/', (_req: Request, res: Response) => {
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
		try {
			await initializeAgentStore()
			const migrated = await migrateLegacyAgentData(pool)
			console.log(`✓ MongoDB Agent 轨迹已就绪（历史回填：${migrated.runs} runs / ${migrated.steps} steps / ${migrated.events} events）`)
		} catch (error) {
			// Agent 可观测性是辅助能力，MongoDB 故障不能拖垮登录、Feed 等 PostgreSQL 核心链路。
			console.error('× MongoDB Agent 轨迹暂不可用；认证和核心内容服务将继续启动：', error)
		}
		await resumeReviewJobs()
		app.listen(PORT, () => {
			console.log(`🚀 服务器运行在: http://localhost:${PORT}`)
		})
	} catch {
		console.error('× 服务启动终止：数据库结构未准备完成')
		process.exitCode = 1
	}
}

void startServer()
