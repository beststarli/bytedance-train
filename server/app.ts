import express, { Request, Response, Application } from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

import authRoutes from './src/routes/auth';
import contentRoutes from './src/routes/content';

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

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在: http://localhost:${PORT}`);
});