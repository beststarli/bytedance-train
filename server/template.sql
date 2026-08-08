  -- 创建用户表
  CREATE TABLE users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone         VARCHAR(20) UNIQUE NOT NULL,
      email         VARCHAR(100),
      nickname      VARCHAR(50),
      avatar_url    TEXT,
      password_hash VARCHAR(255),
      status        VARCHAR(20) DEFAULT 'active',
      last_login_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- 验证码表
  CREATE TABLE verification (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone         VARCHAR(20) NOT NULL,
      code          VARCHAR(6) NOT NULL,
      type          VARCHAR(20) NOT NULL DEFAULT 'login',
      expires_at    TIMESTAMPTZ NOT NULL,
      used_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- Refresh Token 会话（仅保存摘要，泄露数据库时不会暴露原始令牌）
  CREATE TABLE refresh_tokens (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      jti           UUID UNIQUE NOT NULL,
      token_hash    CHAR(64) UNIQUE NOT NULL,
      expires_at    TIMESTAMPTZ NOT NULL,
      revoked_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

  -- 聊天会话
  CREATE TABLE chats (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title         VARCHAR(200) NOT NULL DEFAULT '新对话',
      summary       TEXT,                    -- 历史对话摘要（长对话压缩）
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- 聊天消息
  CREATE TABLE messages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id       UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role          VARCHAR(20) NOT NULL DEFAULT 'user',
      content       TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- Prompt 模板
  CREATE TABLE prompts (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title         VARCHAR(200) NOT NULL,
      description   TEXT,
      content       TEXT NOT NULL,
      category      VARCHAR(50),
      icon          VARCHAR(50),
      sort_order    INTEGER DEFAULT 0,
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- 默认 Prompt 模板
  INSERT INTO prompts (title, description, content, category, icon) VALUES
    ('撰写文章', '快速生成一篇结构完整的文章', '请帮我撰写一篇关于{主题}的文章，要求结构完整、内容详实', 'writing', 'FileText'),
    ('生成图片', '根据描述生成配图', '根据以下描述生成一张图片：{描述}。风格要求：{风格}。', 'image', 'ImageIcon'),
    ('图片修改', '基于当前引用图片按要求调整画面', '请以当前引用的图片为基础，根据我的需求{修改需求}，生成风格为{目标风格}的新图片。', 'image_edit', 'WandSparkles'),
    ('内容优化', '优化已有文本内容', '请优化以下文本：{内容}', 'optimize', 'Sparkles');

  -- 已发布作品
  CREATE TABLE works (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title         VARCHAR(200) NOT NULL DEFAULT '未命名作品',
      content       TEXT NOT NULL DEFAULT '',
      status        VARCHAR(20) NOT NULL DEFAULT 'published',
      quality_score DECIMAL(3,1),
      view_count    INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  -- 素材库
  CREATE TABLE materials (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename      VARCHAR(255) NOT NULL,
      url           TEXT NOT NULL,
      type          VARCHAR(20) NOT NULL DEFAULT 'image',
      size          INTEGER,
      source_url    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE UNIQUE INDEX idx_materials_user_source_unique
    ON materials (user_id, source_url) WHERE source_url IS NOT NULL;

  -- 作品不可变版本：审核失败时保留线上版本，修改稿通过后再原子替换。
  CREATE TABLE work_versions (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      work_id           UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      parent_version_id UUID REFERENCES work_versions(id) ON DELETE SET NULL,
      version_number    INTEGER NOT NULL,
      title             VARCHAR(200) NOT NULL,
      content           TEXT NOT NULL,
      source            VARCHAR(20) NOT NULL DEFAULT 'user',
      status            VARCHAR(24) NOT NULL DEFAULT 'draft',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (work_id, version_number)
  );

  ALTER TABLE works ADD COLUMN review_status VARCHAR(24) NOT NULL DEFAULT 'none';
  ALTER TABLE works ADD COLUMN latest_version_id UUID;
  ALTER TABLE works ADD COLUMN published_version_id UUID;

  -- Agent 运行、步骤与事件轨迹，供内容生成、提示词生成、审核和改写共用。
  CREATE TABLE agent_runs (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_type     VARCHAR(40) NOT NULL,
      status        VARCHAR(24) NOT NULL DEFAULT 'queued',
      current_step  VARCHAR(80),
      input         JSONB NOT NULL DEFAULT '{}'::jsonb,
      output        JSONB,
      error         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at  TIMESTAMPTZ
  );

  CREATE TABLE agent_steps (
      id            BIGSERIAL PRIMARY KEY,
      run_id        UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      step_name     VARCHAR(80) NOT NULL,
      status        VARCHAR(24) NOT NULL,
      input         JSONB,
      output        JSONB,
      error         TEXT,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at  TIMESTAMPTZ
  );

  CREATE TABLE agent_events (
      id          BIGSERIAL PRIMARY KEY,
      run_id      UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
      event_type  VARCHAR(50) NOT NULL,
      payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE review_jobs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      work_id         UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      work_version_id UUID NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_run_id    UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
      status          VARCHAR(24) NOT NULL DEFAULT 'queued',
      decision        VARCHAR(24),
      risk_score      DECIMAL(5,2),
      quality_score   DECIMAL(5,2),
      summary         TEXT,
      model_version   VARCHAR(120),
      raw_result      JSONB,
      error           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at      TIMESTAMPTZ,
      completed_at    TIMESTAMPTZ
  );

  CREATE TABLE review_findings (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_job_id  UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
      category       VARCHAR(50) NOT NULL,
      severity       VARCHAR(20) NOT NULL,
      confidence     DECIMAL(5,4) NOT NULL DEFAULT 0,
      excerpt        TEXT,
      reason         TEXT NOT NULL,
      suggestion     TEXT,
      replacement    TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE rewrite_proposals (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_job_id       UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
      finding_id          UUID REFERENCES review_findings(id) ON DELETE CASCADE,
      work_version_id     UUID NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
      agent_run_id        UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
      original_content    TEXT NOT NULL,
      replacement_content TEXT NOT NULL,
      reason              TEXT,
      status              VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at          TIMESTAMPTZ
  );

  -- 第一阶段审核知识库。后续可在保持 Tool 接口不变的情况下换成 pgvector 混合检索。
  CREATE TABLE review_policies (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code        VARCHAR(80) UNIQUE NOT NULL,
      category    VARCHAR(50) NOT NULL,
      title       VARCHAR(200) NOT NULL,
      content     TEXT NOT NULL,
      severity    VARCHAR(20) NOT NULL DEFAULT 'medium',
      keywords    TEXT[] NOT NULL DEFAULT '{}',
      is_active   BOOLEAN NOT NULL DEFAULT true,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
