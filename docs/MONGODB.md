# MongoDB Agent 轨迹存储

项目第一阶段只把 Agent 可观测性数据迁移到 MongoDB：

- `agent_runs`：运行状态、输入和输出；
- `agent_steps`：每一步的输入、输出、状态和耗时；
- `agent_events`：运行期间持续追加的事件。

用户、作品、作品版本、审核事务、互动、素材和提示词继续由 PostgreSQL 管理。`review_jobs.agent_run_id` 和 `rewrite_proposals.agent_run_id` 只保存 MongoDB Run ID，不再建立 PostgreSQL 外键。

## Compass 是否必需

不必安装。MongoDB Compass 只是查看和管理数据的桌面客户端，后端通过 MongoDB Node.js Driver 直接连接数据库。真正必需的是一个 MongoDB 服务，可以使用本机 MongoDB、Docker 或 MongoDB Atlas。

## 环境变量

在项目根目录 `.env` 中配置：

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DATABASE=bytedance_train
```

如果使用 Atlas，把 `MONGODB_URI` 替换为 Atlas 提供的连接串，并避免将账号密码提交到 Git。

## 不安装 Compass 的本地启动方式

已经安装 Docker 时，可单独启动 MongoDB 服务：

```bash
docker run --name bytedance-train-mongo \
  -p 27017:27017 \
  -v bytedance-train-mongo-data:/data/db \
  -d mongo:8
```

然后正常启动项目。后端会执行以下操作：

1. 检查 MongoDB 连接；
2. 创建查询所需索引；
3. 将旧 PostgreSQL `agent_runs / agent_steps / agent_events` 幂等回填到 MongoDB；
4. 所有新 Agent 轨迹只写入 MongoDB。

MongoDB 暂时不可用时，后端仍会启动认证、Feed 和其他 PostgreSQL 核心接口；依赖
Agent 轨迹的 AI 生成、提示词生成和审核功能会返回错误，直到 MongoDB 恢复。这样辅助
可观测性存储不会扩大为整站故障。

旧 PostgreSQL 轨迹表暂时保留作为回滚来源。历史回填使用 `$setOnInsert`，重复启动不会覆盖 MongoDB 中已经更新的数据。

## 验证

安装 `mongosh` 后可以检查集合，无需 Compass：

```bash
mongosh "$MONGODB_URI" --eval \
  'db.getSiblingDB("bytedance_train").getCollectionNames()'
```

应当看到 `agent_runs`、`agent_steps`、`agent_events`。
