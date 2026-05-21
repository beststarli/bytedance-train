import express, { Request, Response, Application } from 'express';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const app: Application = express();
const PORT = process.env.Server_Port || 4001;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.get('/', (req: Request, res: Response) => {
    res.json({ message: 'Hello Express + TypeScript! 🚀' });
});

app.get('/api/users', (req: Request, res: Response) => {
    res.json([
        { id: 1, name: '张三' },
        { id: 2, name: '李四' }
    ]);
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在: http://localhost:${PORT}`);
});