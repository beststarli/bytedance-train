import { pool } from './db'
import { migrateLocalUploadsToObjectStorage, objectStorageConfigured } from './objectStorage'

// 启动时自动执行的数据库迁移（幂等，可重复执行）
const MIGRATIONS_SQL = `
	ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50);
	ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL AND BTRIM(email) <> '';
	CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_unique ON users (LOWER(nickname)) WHERE nickname IS NOT NULL AND BTRIM(nickname) <> '';
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
	CREATE TABLE IF NOT EXISTS work_view_events (
		id BIGSERIAL PRIMARY KEY,
		work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
		viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_work_view_events_work_time ON work_view_events(work_id, viewed_at);
	CREATE TABLE IF NOT EXISTS materials (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		filename VARCHAR(255) NOT NULL,
		url TEXT NOT NULL,
		type VARCHAR(20) NOT NULL DEFAULT 'image',
		size INTEGER,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);
	ALTER TABLE materials ADD COLUMN IF NOT EXISTS source_url TEXT;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_user_source_unique
		ON materials (user_id, source_url) WHERE source_url IS NOT NULL;
	CREATE INDEX IF NOT EXISTS idx_materials_user_id ON materials(user_id);
	ALTER TABLE works ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,1);
	ALTER TABLE works ALTER COLUMN quality_score TYPE DECIMAL(5,2);
	ALTER TABLE works ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
	ALTER TABLE works ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';
	ALTER TABLE works ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
	ALTER TABLE works ADD COLUMN IF NOT EXISTS review_status VARCHAR(24) NOT NULL DEFAULT 'none';
	ALTER TABLE works ADD COLUMN IF NOT EXISTS latest_version_id UUID;
	ALTER TABLE works ADD COLUMN IF NOT EXISTS published_version_id UUID;
	CREATE TABLE IF NOT EXISTS work_versions (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
		parent_version_id UUID REFERENCES work_versions(id) ON DELETE SET NULL,
		version_number INTEGER NOT NULL,
		title VARCHAR(200) NOT NULL,
		content TEXT NOT NULL,
		source VARCHAR(20) NOT NULL DEFAULT 'user',
		status VARCHAR(24) NOT NULL DEFAULT 'draft',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		UNIQUE (work_id, version_number)
	);
	CREATE INDEX IF NOT EXISTS idx_work_versions_work_created
		ON work_versions(work_id, created_at DESC);
	CREATE TABLE IF NOT EXISTS agent_runs (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		task_type VARCHAR(40) NOT NULL,
		status VARCHAR(24) NOT NULL DEFAULT 'queued',
		current_step VARCHAR(80),
		input JSONB NOT NULL DEFAULT '{}'::jsonb,
		output JSONB,
		error TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		completed_at TIMESTAMPTZ
	);
	CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created
		ON agent_runs(user_id, created_at DESC);
	CREATE TABLE IF NOT EXISTS agent_steps (
		id BIGSERIAL PRIMARY KEY,
		run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
		step_name VARCHAR(80) NOT NULL,
		status VARCHAR(24) NOT NULL,
		input JSONB,
		output JSONB,
		error TEXT,
		started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		completed_at TIMESTAMPTZ
	);
	CREATE TABLE IF NOT EXISTS agent_events (
		id BIGSERIAL PRIMARY KEY,
		run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
		event_type VARCHAR(50) NOT NULL,
		payload JSONB NOT NULL DEFAULT '{}'::jsonb,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE INDEX IF NOT EXISTS idx_agent_events_run_id ON agent_events(run_id, id);
	CREATE TABLE IF NOT EXISTS review_jobs (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
		work_version_id UUID NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
		user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		agent_run_id UUID,
		status VARCHAR(24) NOT NULL DEFAULT 'queued',
		decision VARCHAR(24),
		risk_score DECIMAL(5,2),
		quality_score DECIMAL(5,2),
		summary TEXT,
		model_version VARCHAR(120),
		raw_result JSONB,
		error TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		started_at TIMESTAMPTZ,
		completed_at TIMESTAMPTZ
	);
	CREATE INDEX IF NOT EXISTS idx_review_jobs_user_created
		ON review_jobs(user_id, created_at DESC);
	CREATE INDEX IF NOT EXISTS idx_review_jobs_work_created
		ON review_jobs(work_id, created_at DESC);
	CREATE TABLE IF NOT EXISTS review_findings (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		review_job_id UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
		category VARCHAR(50) NOT NULL,
		severity VARCHAR(20) NOT NULL,
		confidence DECIMAL(5,4) NOT NULL DEFAULT 0,
		excerpt TEXT,
		reason TEXT NOT NULL,
		suggestion TEXT,
		replacement TEXT,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS rewrite_proposals (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		review_job_id UUID NOT NULL REFERENCES review_jobs(id) ON DELETE CASCADE,
		finding_id UUID REFERENCES review_findings(id) ON DELETE CASCADE,
		work_version_id UUID NOT NULL REFERENCES work_versions(id) ON DELETE CASCADE,
		agent_run_id UUID,
		original_content TEXT NOT NULL,
		replacement_content TEXT NOT NULL,
		reason TEXT,
		status VARCHAR(20) NOT NULL DEFAULT 'pending',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		decided_at TIMESTAMPTZ
	);
	ALTER TABLE rewrite_proposals ADD COLUMN IF NOT EXISTS agent_run_id UUID;
	-- Agent 轨迹已迁移至 MongoDB；关系库只保留 UUID 引用，不能建立跨数据库外键。
	ALTER TABLE review_jobs DROP CONSTRAINT IF EXISTS review_jobs_agent_run_id_fkey;
	ALTER TABLE rewrite_proposals DROP CONSTRAINT IF EXISTS rewrite_proposals_agent_run_id_fkey;
	CREATE TABLE IF NOT EXISTS review_policies (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		code VARCHAR(80) UNIQUE NOT NULL,
		category VARCHAR(50) NOT NULL,
		title VARCHAR(200) NOT NULL,
		content TEXT NOT NULL,
		severity VARCHAR(20) NOT NULL DEFAULT 'medium',
		keywords TEXT[] NOT NULL DEFAULT '{}',
		is_active BOOLEAN NOT NULL DEFAULT true,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	INSERT INTO review_policies (code, category, title, content, severity, keywords) VALUES
		('privacy-personal-data', 'privacy', '个人敏感信息保护',
		 '不得公开传播能够直接识别自然人的身份证号、银行卡号、精确住址、私人联系方式等敏感个人信息；新闻报道或必要引用也应进行脱敏。',
		 'high', ARRAY['身份证','银行卡','手机号','住址','隐私']),
		('illegal-gambling', 'gambling', '赌博及非法博彩',
		 '不得推广赌博平台、博彩开户链接、赌博代充、下注策略或诱导用户参与赌博活动。',
		 'critical', ARRAY['赌博','博彩','下注','赌场','代充']),
		('illegal-drugs', 'drugs', '毒品及违禁品交易',
		 '不得提供毒品或违禁品购买、出售、制作、运输和交易渠道；科普、禁毒宣传需保持明确反对立场。',
		 'critical', ARRAY['毒品','冰毒','海洛因','违禁品','交易']),
		('fraud-and-diversion', 'fraud', '诈骗与恶意引流',
		 '不得以高额回报、刷单返利、虚假投资、内部渠道等话术诱导转账或将用户引流至不明渠道。',
		 'high', ARRAY['刷单','返利','高额回报','转账','内部渠道']),
		('quality-clickbait', 'quality', '内容质量与标题一致性',
		 '标题应准确概括正文，不得使用严重夸张、虚构结论或与正文不一致的标题；内容应具有基本事实依据和完整表达。',
		 'medium', ARRAY['震惊','必看','真相','标题','独家'])
	ON CONFLICT (code) DO UPDATE SET
		category = EXCLUDED.category, title = EXCLUDED.title, content = EXCLUDED.content,
		severity = EXCLUDED.severity, keywords = EXCLUDED.keywords, updated_at = NOW();
	INSERT INTO work_versions (work_id, version_number, title, content, source, status)
	SELECT w.id, 1, w.title, w.content, 'migration',
		CASE WHEN w.status = 'published' THEN 'approved' ELSE 'draft' END
	FROM works w
	WHERE NOT EXISTS (SELECT 1 FROM work_versions v WHERE v.work_id = w.id);
	UPDATE works w
	SET latest_version_id = COALESCE(
			w.latest_version_id,
			(SELECT id FROM work_versions WHERE work_id = w.id ORDER BY version_number DESC LIMIT 1)
		),
		published_version_id = CASE
			WHEN w.status = 'published' THEN COALESCE(
				w.published_version_id,
				(SELECT id FROM work_versions WHERE work_id = w.id ORDER BY version_number DESC LIMIT 1)
			)
			ELSE w.published_version_id
		END,
		review_status = CASE
			WHEN w.review_status = 'none' AND w.status = 'published' THEN 'approved'
			ELSE w.review_status
		END
	WHERE w.latest_version_id IS NULL
	   OR (w.status = 'published' AND w.published_version_id IS NULL);
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
	DO $$
	BEGIN
		IF to_regclass('public.prompts') IS NOT NULL THEN
			UPDATE prompts
			SET title = '图片修改',
				description = '基于当前引用图片按要求调整画面',
				content = '请以当前引用的图片为基础，根据我的需求{修改需求}，生成风格为{目标风格}的新图片。',
				category = 'image_edit',
				icon = 'WandSparkles'
			WHERE category = 'video'
			   OR icon IN ('Video', 'VideoIcon')
			   OR title IN ('视频脚本', '短视频脚本', '局部重绘')
			   OR content LIKE '%生成一个短视频脚本%';

			IF NOT EXISTS (
				SELECT 1 FROM prompts
				WHERE title = '图片修改' AND category = 'image_edit'
			) THEN
				INSERT INTO prompts (title, description, content, category, icon)
				VALUES (
					'图片修改',
					'基于当前引用图片按要求调整画面',
					'请以当前引用的图片为基础，根据我的需求{修改需求}，生成风格为{目标风格}的新图片。',
					'image_edit',
					'WandSparkles'
				);
			END IF;

			DELETE FROM prompts
			WHERE id IN (
				SELECT id FROM (
					SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS duplicate_rank
					FROM prompts
					WHERE title = '图片修改'
					  AND category = 'image_edit'
					  AND content = '请以当前引用的图片为基础，根据我的需求{修改需求}，生成风格为{目标风格}的新图片。'
				) duplicate_defaults
				WHERE duplicate_rank > 1
			);
		END IF;
	END $$;
`

export async function runMigrations() {
	try {
		await pool.query(MIGRATIONS_SQL)
		console.log('✓ 数据库迁移完成')
		if (objectStorageConfigured()) {
			try {
				await migrateLocalUploadsToObjectStorage()
				console.log('✓ RustFS 对象存储已连接，本地资源迁移完成')
			} catch (error) {
				console.error('× RustFS 连接或资源迁移失败，服务将继续启动：', error)
			}
		}
	} catch (err) {
		console.error('× 数据库迁移失败:', err)
		throw err
	}
}
