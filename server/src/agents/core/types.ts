export type AgentTaskType = 'content_generation' | 'prompt_generation' | 'content_review' | 'content_rewrite'
export type AgentRunStatus = 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'cancelled'

export interface AgentState<Input = unknown, Output = unknown> {
	runId: string
	userId: string
	taskType: AgentTaskType
	status: AgentRunStatus
	currentStep: string
	input: Input
	output?: Output
}

export interface ReviewFinding {
	category: string
	severity: 'low' | 'medium' | 'high' | 'critical'
	confidence: number
	excerpt: string
	reason: string
	suggestion: string
	replacement?: string
}

export interface ReviewResult {
	decision: 'approved' | 'needs_revision' | 'blocked'
	riskScore: number
	qualityScore: number
	summary: string
	findings: ReviewFinding[]
	modelVersion: string
	raw: unknown
}
