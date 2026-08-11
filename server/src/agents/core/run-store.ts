import type { AgentState, AgentTaskType } from './types'
import { insertAgentRun } from './agent-store'

export async function createAgentState<Input>(
	userId: string,
	taskType: AgentTaskType,
	input: Input,
): Promise<AgentState<Input>> {
	const runId = await insertAgentRun({ userId, taskType, input })
	return {
		runId,
		userId,
		taskType,
		status: 'queued',
		currentStep: 'queued',
		input,
	}
}
