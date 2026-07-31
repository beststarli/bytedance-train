import { pool } from '../../utils/db'
import type { AgentState } from './types'

function safeJson(value: unknown) {
	return JSON.stringify(value ?? null)
}

export class WorkflowRunner<State extends AgentState> {
	constructor(public readonly state: State) {}

	async start() {
		this.state.status = 'running'
		await pool.query(
			`UPDATE agent_runs
			 SET status = 'running', current_step = $1, updated_at = NOW(), error = NULL
			 WHERE id = $2`,
			[this.state.currentStep, this.state.runId],
		)
	}

	async step<Output>(name: string, input: unknown, handler: () => Promise<Output> | Output): Promise<Output> {
		this.state.currentStep = name
		await pool.query(
			`UPDATE agent_runs SET current_step = $1, updated_at = NOW() WHERE id = $2`,
			[name, this.state.runId],
		)
		const { rows } = await pool.query(
			`INSERT INTO agent_steps (run_id, step_name, status, input)
			 VALUES ($1, $2, 'running', $3::jsonb) RETURNING id`,
			[this.state.runId, name, safeJson(input)],
		)
		const stepId = rows[0].id
		await pool.query(
			`INSERT INTO agent_events (run_id, event_type, payload)
			 VALUES ($1, 'step_started', $2::jsonb)`,
			[this.state.runId, safeJson({ step: name })],
		)
		try {
			const output = await handler()
			await pool.query(
				`UPDATE agent_steps
				 SET status = 'completed', output = $1::jsonb, completed_at = NOW()
				 WHERE id = $2`,
				[safeJson(output), stepId],
			)
			await pool.query(
				`INSERT INTO agent_events (run_id, event_type, payload)
				 VALUES ($1, 'step_completed', $2::jsonb)`,
				[this.state.runId, safeJson({ step: name })],
			)
			return output
		} catch (error) {
			const message = error instanceof Error ? error.message : '工作流步骤执行失败'
			await pool.query(
				`UPDATE agent_steps
				 SET status = 'failed', error = $1, completed_at = NOW()
				 WHERE id = $2`,
				[message, stepId],
			)
			throw error
		}
	}

	async complete(output: unknown) {
		this.state.status = 'completed'
		await pool.query(
			`UPDATE agent_runs
			 SET status = 'completed', output = $1::jsonb, updated_at = NOW(), completed_at = NOW()
			 WHERE id = $2`,
			[safeJson(output), this.state.runId],
		)
	}

	async waitForUser(output: unknown) {
		this.state.status = 'waiting_user'
		await pool.query(
			`UPDATE agent_runs
			 SET status = 'waiting_user', current_step = 'await_user_approval',
				 output = $1::jsonb, updated_at = NOW()
			 WHERE id = $2`,
			[safeJson(output), this.state.runId],
		)
		await pool.query(
			`INSERT INTO agent_events (run_id, event_type, payload)
			 VALUES ($1, 'waiting_user', $2::jsonb)`,
			[this.state.runId, safeJson({ step: 'await_user_approval' })],
		)
	}

	async fail(error: unknown) {
		const message = error instanceof Error ? error.message : 'Agent 工作流执行失败'
		this.state.status = 'failed'
		await pool.query(
			`UPDATE agent_runs
			 SET status = 'failed', error = $1, updated_at = NOW(), completed_at = NOW()
			 WHERE id = $2`,
			[message, this.state.runId],
		)
	}
}
