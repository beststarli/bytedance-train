import { pool } from '../../utils/db'
import type { AgentState, AgentTaskType } from './types'

export async function createAgentState<Input>(
	userId: string,
	taskType: AgentTaskType,
	input: Input,
): Promise<AgentState<Input>> {
	const { rows } = await pool.query(
		`INSERT INTO agent_runs (user_id, task_type, status, current_step, input)
		 VALUES ($1, $2, 'queued', 'queued', $3::jsonb)
		 RETURNING id`,
		[userId, taskType, JSON.stringify(input)],
	)
	return {
		runId: rows[0].id,
		userId,
		taskType,
		status: 'queued',
		currentStep: 'queued',
		input,
	}
}

