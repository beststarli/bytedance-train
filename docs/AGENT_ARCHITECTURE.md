# 创作与内容审核 Agent 架构

> 面试准备与零基础概念说明见 [AI_AGENT_INTERVIEW_GUIDE.md](./AI_AGENT_INTERVIEW_GUIDE.md)。

## 目标

平台将内容生成、提示词生成、内容审核和合规改写统一到一个可追踪的 Agent Runtime 中。每次运行都有独立状态、步骤和事件，长任务可恢复，审核结论可解释，AI 生成的替代内容必须经过用户确认后才进入新版本。

## 分层结构

```text
HTTP / SSE API
  └─ Agent Runtime
      ├─ WorkflowRunner：步骤编排、状态转换、失败记录
      ├─ ModelGateway：DeepSeek / 火山方舟 OpenAI 兼容接口
      ├─ RunStore：MongoDB agent_runs / agent_steps / agent_events
      ├─ Tools
      │   └─ PolicyRetriever：审核规则与知识检索
      └─ Workflows
          ├─ content_generation
          ├─ prompt_generation（复用 Prompt Skill）
          ├─ content_review
          └─ content_rewrite（Human-in-the-loop）
```

`WorkflowRunner` 负责通用生命周期，具体 Workflow 只描述业务步骤；Prompt Skill 继续负责可复用的提示词生成能力。模型调用通过 `AgentModelGateway` 统一，避免每个业务模块重复拼装供应商接口。

## Agent 状态机

```text
queued → running → completed
                 ↘ failed
                 ↘ cancelled
                 ↘ waiting_user → completed
```

- `content_review`：规则扫描、策略检索、模型结构化判定、决策合并。
- `content_rewrite`：生成最小范围替代建议后进入 `waiting_user`；用户采用后才进入 `completed`。
- `agent_steps` 保存步骤输入、输出、耗时和错误。
- `agent_events` 保存流式进度、等待确认和用户采用等事件，后续可以直接接入 SSE/WebSocket。

## 发布与审核链路

```text
用户提交发布
  → 创建不可变 work_version
  → review_job 排队
  → AI 多层审核
      1. 确定性规则扫描
      2. 审核政策检索
      3. LLM 安全与质量结构化判定
      4. 规则与模型结果合并
  ├─ approved：原子提升为线上版本并自动发布
  └─ needs_revision / blocked：
       保留原线上版本
       → 展示命中片段与原因
       → AI 生成替代建议
       → 用户审查并选择采用
       → 生成新草稿版本
       → 重新提交审核
```

编辑已发布文章时不会覆盖线上正文，也不会清零浏览、点赞、收藏数据。只有新版本通过审核时才更新文章正文和发布日期。

## 审核策略：规则 + 检索 + LLM

敏感信息识别不应只使用词向量：

1. 身份证、手机号、银行卡等格式明确的内容，用规则和实体识别保证召回。
2. 赌博、毒品、诈骗等政策语义从 `review_policies` 检索相关规则，作为模型判定依据。
3. LLM 负责上下文、传播意图、内容质量和最终结构化解释。
4. 严重规则命中可以提升风险等级，防止模型漏判。

当前第一阶段采用“关键词 + 类别”的政策混合检索，接口位于
`server/src/agents/tools/policy-retriever.ts`。后续可为 `review_policies` 增加 pgvector 向量列并替换该 Tool 的内部实现，不需要改变 Workflow。

准确率目标不能仅靠单次模型输出宣称，应建立标注测试集，分别统计高危类别的 precision、recall、F1 和漏放率，并通过灰度阈值持续校准。

## 数据模型

- `work_versions`：不可变作品版本与父版本链。
- `review_jobs`：审核任务、结论、风险分、质量分及原始结构化结果。
- `review_findings`：类别、严重级别、置信度、命中片段、原因和建议。
- `rewrite_proposals`：原片段、替代片段、用户决定和对应 Agent Run。
- `review_policies`：可维护的审核政策知识。
- MongoDB `agent_runs / agent_steps / agent_events`：统一 Agent 可观测性；PostgreSQL
  旧表仅作为历史回填和回滚来源，不再接收新轨迹。

## API

- `POST /api/content/works`：`status=published` 时创建作品并提交审核。
- `PUT /api/content/works/:id`：`status=published` 时提交新版本审核。
- `GET /api/content/reviews`：当前用户审核列表。
- `GET /api/content/reviews/:id`：审核结论、问题、替代建议和 Agent 轨迹。
- `POST /api/content/works/:id/submit-review`：重新提交最新候选版本。
- `POST /api/content/review-jobs/:id/rewrite`：生成 AI 替代建议。
- `POST /api/content/rewrite-proposals/:id/apply`：用户采用建议并创建新草稿版本。
- `POST /api/content/rewrite-proposals/:id/reject`：用户明确保留原文并记录决定。

## 生产化演进

- 将进程内任务触发替换为 BullMQ / Redis Streams 等持久队列，多实例部署时避免重复消费。
- 为 `review_policies` 增加 pgvector、政策版本号和生效时间，形成可审计的混合检索。
- 为审核建立人工复核与申诉队列，AI 不应成为无法追责的单点裁决。
- 对模型输出做 JSON Schema 校验、超时、重试、熔断和幂等控制。
- 建立离线审核评测集、在线抽检与误杀/漏放监控，再用数据证明高危识别指标。
