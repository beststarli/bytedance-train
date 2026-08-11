import type { AgentState } from './types'
import { insertAgentEvent, insertAgentStep, updateAgentRun, updateAgentStep } from './agent-store'

export class WorkflowRunner<State extends AgentState> {
	constructor(public readonly state: State) {}

	async start() {
		this.state.status = 'running'
		await updateAgentRun(this.state.runId, { status: 'running', currentStep: this.state.currentStep, error: null })
	}

	async step<Output>(name: string, input: unknown, handler: () => Promise<Output> | Output): Promise<Output> {
		this.state.currentStep = name
		await updateAgentRun(this.state.runId, { currentStep: name })
		const stepId = await insertAgentStep(this.state.runId, name, input)
		await insertAgentEvent(this.state.runId, 'step_started', { step: name })
		try {
			const output = await handler()
			await updateAgentStep(stepId, { status: 'completed', output, completedAt: new Date() })
			await insertAgentEvent(this.state.runId, 'step_completed', { step: name })
			return output
		} catch (error) {
			const message = error instanceof Error ? error.message : '工作流步骤执行失败'
			await updateAgentStep(stepId, { status: 'failed', error: message, completedAt: new Date() })
			throw error
		}
	}

	async complete(output: unknown) {
		this.state.status = 'completed'
		await updateAgentRun(this.state.runId, { status: 'completed', output, completedAt: new Date() })
	}

	async waitForUser(output: unknown) {
		this.state.status = 'waiting_user'
		await updateAgentRun(this.state.runId, {
			status: 'waiting_user', currentStep: 'await_user_approval', output,
		})
		await insertAgentEvent(this.state.runId, 'waiting_user', { step: 'await_user_approval' })
	}

	async fail(error: unknown) {
		const message = error instanceof Error ? error.message : 'Agent 工作流执行失败'
		this.state.status = 'failed'
		await updateAgentRun(this.state.runId, { status: 'failed', error: message, completedAt: new Date() })
	}
}
