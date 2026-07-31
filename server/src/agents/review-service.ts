import { pool } from '../utils/db'
import { AgentModelGateway } from './core/model-gateway'
import { runContentReviewWorkflow } from './workflows/content-review'
import { createAgentState } from './core/run-store'
import { WorkflowRunner } from './core/workflow'

interface SubmitReviewInput {
	userId: string
	workId?: string | null
	title: string
	content: string
	source?: 'user' | 'ai'
}

const runningJobs = new Set<string>()

function asErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : '审核工作流执行失败'
}

export async function submitWorkForReview(input: SubmitReviewInput) {
	const title = input.title.trim()
	const content = input.content.trim()
	if (!title || !content) throw new Error('标题和正文不能为空')
	if (title.length > 200) throw new Error('标题不能超过 200 个字符')
	if (content.length > 100_000) throw new Error('正文过长，请控制在 10 万个字符以内')
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		let workId = input.workId || null
		let work: any
		if (workId) {
			const result = await client.query(
				'SELECT * FROM works WHERE id = $1 AND user_id = $2 FOR UPDATE',
				[workId, input.userId],
			)
			work = result.rows[0]
			if (!work) throw new Error('作品不存在')
			if (work.review_status === 'pending_review') throw new Error('该作品正在审核中，请勿重复提交')
		} else {
			const result = await client.query(
				`INSERT INTO works (user_id, title, content, status, review_status)
				 VALUES ($1, $2, $3, 'draft', 'none') RETURNING *`,
				[input.userId, title, content],
			)
			work = result.rows[0]
			workId = work.id
		}

		const versionResult = await client.query(
			`SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next_version
			 FROM work_versions WHERE work_id = $1`,
			[workId],
		)
		const { rows: versions } = await client.query(
			`INSERT INTO work_versions
			 (work_id, parent_version_id, version_number, title, content, source, status)
			 VALUES ($1, $2, $3, $4, $5, $6, 'pending_review')
			 RETURNING *`,
			[
				workId,
				work.latest_version_id || null,
				versionResult.rows[0].next_version,
				title,
				content,
				input.source || 'user',
			],
		)
		const version = versions[0]
		await client.query(
			`UPDATE works
			 SET latest_version_id = $1, review_status = 'pending_review',
				 title = CASE WHEN status = 'published' THEN title ELSE $2 END,
				 content = CASE WHEN status = 'published' THEN content ELSE $3 END,
				 updated_at = NOW()
			 WHERE id = $4`,
			[version.id, title, content, workId],
		)
		const { rows: runs } = await client.query(
			`INSERT INTO agent_runs (user_id, task_type, status, current_step, input)
			 VALUES ($1, 'content_review', 'queued', 'queued', $2::jsonb)
			 RETURNING *`,
			[input.userId, JSON.stringify({ workId, versionId: version.id })],
		)
		const { rows: jobs } = await client.query(
			`INSERT INTO review_jobs (work_id, work_version_id, user_id, agent_run_id, status)
			 VALUES ($1, $2, $3, $4, 'queued') RETURNING *`,
			[workId, version.id, input.userId, runs[0].id],
		)
		await client.query('COMMIT')
		enqueueReviewJob(jobs[0].id)
		return { workId, version, reviewJob: jobs[0], agentRun: runs[0] }
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		client.release()
	}
}

export function enqueueReviewJob(jobId: string) {
	if (runningJobs.has(jobId)) return
	runningJobs.add(jobId)
	setImmediate(() => {
		void runReviewJob(jobId).finally(() => runningJobs.delete(jobId))
	})
}

export async function runReviewJob(jobId: string) {
	const { rows: claimed } = await pool.query(
		`UPDATE review_jobs
		 SET status = 'running', started_at = NOW(), error = NULL
		 WHERE id = $1 AND status = 'queued'
		 RETURNING *`,
		[jobId],
	)
	const job = claimed[0]
	if (!job) return
	try {
		const { rows } = await pool.query(
			`SELECT j.*, v.title, v.content, v.version_number
			 FROM review_jobs j
			 JOIN work_versions v ON v.id = j.work_version_id
			 WHERE j.id = $1`,
			[jobId],
		)
		const detail = rows[0]
		const result = await runContentReviewWorkflow({
			runId: detail.agent_run_id,
			userId: detail.user_id,
			taskType: 'content_review',
			status: 'queued',
			currentStep: 'queued',
			input: { title: detail.title, content: detail.content },
		})
		const client = await pool.connect()
		try {
			await client.query('BEGIN')
			for (const finding of result.findings) {
				const { rows: findings } = await client.query(
					`INSERT INTO review_findings
					 (review_job_id, category, severity, confidence, excerpt, reason, suggestion, replacement)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					 RETURNING id`,
					[
						jobId, finding.category, finding.severity, finding.confidence,
						finding.excerpt, finding.reason, finding.suggestion, finding.replacement || null,
					],
				)
				if (finding.replacement && finding.excerpt) {
					await client.query(
						`INSERT INTO rewrite_proposals
						 (review_job_id, finding_id, work_version_id, original_content, replacement_content, reason)
						 VALUES ($1, $2, $3, $4, $5, $6)`,
						[jobId, findings[0].id, detail.work_version_id, finding.excerpt, finding.replacement, finding.suggestion],
					)
				}
			}
			await client.query(
				`UPDATE review_jobs
				 SET status = 'completed', decision = $1, risk_score = $2, quality_score = $3,
					 summary = $4, model_version = $5, raw_result = $6::jsonb, completed_at = NOW()
				 WHERE id = $7`,
				[
					result.decision, result.riskScore, result.qualityScore, result.summary,
					result.modelVersion, JSON.stringify(result.raw), jobId,
				],
			)
			if (result.decision === 'approved') {
				await client.query(
					`UPDATE work_versions SET status = 'approved' WHERE id = $1`,
					[detail.work_version_id],
				)
				await client.query(
					`UPDATE works
					 SET title = $1, content = $2, status = 'published', review_status = 'approved',
						 quality_score = $3, published_version_id = $4, latest_version_id = $4,
						 created_at = NOW(), updated_at = NOW()
					 WHERE id = $5`,
					[detail.title, detail.content, result.qualityScore, detail.work_version_id, detail.work_id],
				)
			} else {
				await client.query(
					`UPDATE work_versions SET status = $1 WHERE id = $2`,
					[result.decision, detail.work_version_id],
				)
				await client.query(
					`UPDATE works
					 SET review_status = $1, quality_score = $2, updated_at = NOW()
					 WHERE id = $3`,
					[result.decision, result.qualityScore, detail.work_id],
				)
			}
			await client.query('COMMIT')
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		} finally {
			client.release()
		}
	} catch (error) {
		const message = asErrorMessage(error)
		await Promise.all([
			pool.query(
				`UPDATE review_jobs SET status = 'failed', error = $1, completed_at = NOW() WHERE id = $2`,
				[message, jobId],
			),
			pool.query(
				`UPDATE works SET review_status = 'failed', updated_at = NOW() WHERE id = $1`,
				[job.work_id],
			),
			job.agent_run_id
				? pool.query(
					`UPDATE agent_runs SET status = 'failed', error = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
					[message, job.agent_run_id],
				)
				: Promise.resolve(),
		])
		console.error(`[Review Agent ${jobId}]`, error)
	}
}

export async function resumeReviewJobs() {
	await pool.query(`UPDATE review_jobs SET status = 'queued' WHERE status = 'running'`)
	const { rows } = await pool.query(`SELECT id FROM review_jobs WHERE status = 'queued' ORDER BY created_at ASC`)
	for (const row of rows) enqueueReviewJob(row.id)
}

export async function generateRewriteProposals(jobId: string, userId: string) {
	const { rows } = await pool.query(
		`SELECT j.id, j.work_version_id, v.title, v.content,
			 COALESCE(json_agg(json_build_object(
				'id', f.id, 'category', f.category, 'severity', f.severity,
				'excerpt', f.excerpt, 'reason', f.reason, 'suggestion', f.suggestion
			 ) ORDER BY f.created_at) FILTER (WHERE f.id IS NOT NULL), '[]') AS findings
		 FROM review_jobs j
		 JOIN work_versions v ON v.id = j.work_version_id
		 LEFT JOIN review_findings f ON f.review_job_id = j.id
		 WHERE j.id = $1 AND j.user_id = $2
		 GROUP BY j.id, v.id`,
		[jobId, userId],
	)
	const review = rows[0]
	if (!review) throw new Error('审核记录不存在')
	if (!review.findings.length) throw new Error('当前审核没有可改写的问题')
	const state = await createAgentState(userId, 'content_rewrite', { reviewJobId: jobId })
	const runner = new WorkflowRunner(state)
	await runner.start()
	const gateway = new AgentModelGateway()
	let result: { proposals?: Array<{ finding_id?: string; replacement?: string; reason?: string }> }
	try {
		result = await runner.step('generate_safe_replacements', { findingCount: review.findings.length }, () =>
			gateway.generateJson<{
				proposals?: Array<{ finding_id?: string; replacement?: string; reason?: string }>
			}>(
				`你是内容安全改写 Agent。针对每个审核问题生成最小范围的合规替代内容。
不得修改无关事实、数字、引用和文章结构，不得新增原文没有的信息。
仅返回 JSON：{"proposals":[{"finding_id":"问题ID","replacement":"替代片段","reason":"修改说明"}]}`,
				`标题：${review.title}\n正文：${review.content}\n审核问题：${JSON.stringify(review.findings)}`,
			),
		)
	} catch (error) {
		await runner.fail(error)
		throw error
	}
	const findingMap = new Map(review.findings.map((item: any) => [String(item.id), item]))
	const proposals = []
	for (const item of result.proposals || []) {
		const finding = findingMap.get(String(item.finding_id)) as any
		const replacement = String(item.replacement || '').trim()
		if (!finding?.excerpt || !replacement) continue
		const { rows: inserted } = await pool.query(
			`INSERT INTO rewrite_proposals
			 (review_job_id, finding_id, work_version_id, agent_run_id, original_content, replacement_content, reason)
			 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
			[jobId, finding.id, review.work_version_id, state.runId, finding.excerpt, replacement, String(item.reason || finding.suggestion || '')],
		)
		proposals.push(inserted[0])
	}
	if (!proposals.length) {
		const error = new Error('AI 没有生成可用的替代内容')
		await runner.fail(error)
		throw error
	}
	await runner.waitForUser({ proposalIds: proposals.map((item) => item.id) })
	return proposals
}

export async function applyRewriteProposal(proposalId: string, userId: string) {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const { rows } = await client.query(
			`SELECT p.*, j.work_id, v.title,
			 w.latest_version_id, w.status AS work_status
			 FROM rewrite_proposals p
			 JOIN review_jobs j ON j.id = p.review_job_id
			 JOIN work_versions v ON v.id = p.work_version_id
			 JOIN works w ON w.id = j.work_id
			 WHERE p.id = $1 AND j.user_id = $2
			 FOR UPDATE OF p, w`,
			[proposalId, userId],
		)
		const proposal = rows[0]
		if (!proposal) throw new Error('替代建议不存在')
		if (proposal.status !== 'pending') throw new Error('该替代建议已经处理')
		const { rows: latestRows } = await client.query(
			`SELECT * FROM work_versions WHERE id = $1`,
			[proposal.latest_version_id || proposal.work_version_id],
		)
		const latest = latestRows[0]
		if (!latest.content.includes(proposal.original_content)) {
			throw new Error('当前版本已发生变化，请重新生成替代建议')
		}
		const content = latest.content.replace(proposal.original_content, proposal.replacement_content)
		const { rows: versionNumbers } = await client.query(
			`SELECT COALESCE(MAX(version_number), 0)::int + 1 AS next_version
			 FROM work_versions WHERE work_id = $1`,
			[proposal.work_id],
		)
		const { rows: versions } = await client.query(
			`INSERT INTO work_versions
			 (work_id, parent_version_id, version_number, title, content, source, status)
			 VALUES ($1, $2, $3, $4, $5, 'ai', 'draft') RETURNING *`,
			[proposal.work_id, latest.id, versionNumbers[0].next_version, latest.title, content],
		)
		await client.query(
			`UPDATE rewrite_proposals SET status = 'accepted', decided_at = NOW() WHERE id = $1`,
			[proposalId],
		)
		if (proposal.agent_run_id) {
			await client.query(
				`UPDATE agent_runs
				 SET status = 'completed', current_step = 'user_approved',
					 updated_at = NOW(), completed_at = NOW()
				 WHERE id = $1
				   AND NOT EXISTS (
					   SELECT 1 FROM rewrite_proposals
					   WHERE agent_run_id = $1 AND status = 'pending'
				   )`,
				[proposal.agent_run_id],
			)
			await client.query(
				`INSERT INTO agent_events (run_id, event_type, payload)
				 VALUES ($1, 'proposal_accepted', $2::jsonb)`,
				[proposal.agent_run_id, JSON.stringify({ proposalId })],
			)
		}
		await client.query(
			`UPDATE works
			 SET latest_version_id = $1, review_status = 'needs_revision',
				 title = CASE WHEN status = 'published' THEN title ELSE $2 END,
				 content = CASE WHEN status = 'published' THEN content ELSE $3 END,
				 updated_at = NOW()
			 WHERE id = $4`,
			[versions[0].id, latest.title, content, proposal.work_id],
		)
		await client.query('COMMIT')
		return { workId: proposal.work_id, version: versions[0] }
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		client.release()
	}
}

export async function rejectRewriteProposal(proposalId: string, userId: string) {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const { rows } = await client.query(
			`SELECT p.*
			 FROM rewrite_proposals p
			 JOIN review_jobs j ON j.id = p.review_job_id
			 WHERE p.id = $1 AND j.user_id = $2
			 FOR UPDATE OF p`,
			[proposalId, userId],
		)
		const proposal = rows[0]
		if (!proposal) throw new Error('替代建议不存在')
		if (proposal.status !== 'pending') throw new Error('该替代建议已经处理')
		await client.query(
			`UPDATE rewrite_proposals SET status = 'rejected', decided_at = NOW() WHERE id = $1`,
			[proposalId],
		)
		if (proposal.agent_run_id) {
			await client.query(
				`INSERT INTO agent_events (run_id, event_type, payload)
				 VALUES ($1, 'proposal_rejected', $2::jsonb)`,
				[proposal.agent_run_id, JSON.stringify({ proposalId })],
			)
			await client.query(
				`UPDATE agent_runs
				 SET status = 'completed', current_step = 'user_decided',
					 updated_at = NOW(), completed_at = NOW()
				 WHERE id = $1
				   AND NOT EXISTS (
					   SELECT 1 FROM rewrite_proposals
					   WHERE agent_run_id = $1 AND status = 'pending'
				   )`,
				[proposal.agent_run_id],
			)
		}
		await client.query('COMMIT')
		return { proposalId, status: 'rejected' as const }
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		client.release()
	}
}
