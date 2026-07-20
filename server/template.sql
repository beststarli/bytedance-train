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
    ('视频脚本', '生成短视频拍摄脚本', '请为以下主题生成一个短视频脚本：{主题}', 'video', 'VideoIcon'),
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
