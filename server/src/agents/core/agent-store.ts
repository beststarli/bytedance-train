import { randomUUID } from 'crypto'
import type { Pool } from 'pg'
import { connectMongo } from '../../utils/mongo'
import type { AgentRunStatus, AgentTaskType } from './types'

interface AgentRunDocument {
	_id: string
	userId: string
	taskType: AgentTaskType
	status: AgentRunStatus
	currentStep: string
	input: unknown
	output?: unknown
	error?: string | null
	createdAt: Date
	updatedAt: Date
	completedAt?: Date | null
}

interface AgentStepDocument {
	_id: string
	runId: string
	stepName: string
	status: AgentRunStatus
	input?: unknown
	output?: unknown
	error?: string | null
	startedAt: Date
	completedAt?: Date | null
}

interface AgentEventDocument {
	_id: string
	runId: string
	eventType: string
	payload: unknown
	createdAt: Date
}

async function collections() {
	const db = await connectMongo()
	return {
		runs: db.collection<AgentRunDocument>('agent_runs'),
		steps: db.collection<AgentStepDocument>('agent_steps'),
		events: db.collection<AgentEventDocument>('agent_events'),
	}
}

export async function initializeAgentStore() {
	const { runs, steps, events } = await collections()
	await Promise.all([
		runs.createIndex({ userId: 1, createdAt: -1 }),
		runs.createIndex({ status: 1, updatedAt: 1 }),
		steps.createIndex({ runId: 1, startedAt: 1 }),
		events.createIndex({ runId: 1, createdAt: 1 }),
	])
}

export async function insertAgentRun(input: {
	runId?: string
	userId: string
	taskType: AgentTaskType
	input: unknown
}) {
	const runId = input.runId || randomUUID()
	const now = new Date()
	const { runs } = await collections()
	await runs.insertOne({
		_id: runId,
		userId: input.userId,
		taskType: input.taskType,
		status: 'queued',
		currentStep: 'queued',
		input: input.input ?? null,
		createdAt: now,
		updatedAt: now,
	})
	return runId
}

export async function updateAgentRun(runId: string, update: Partial<Omit<AgentRunDocument, '_id' | 'createdAt'>>) {
	const { runs } = await collections()
	await runs.updateOne({ _id: runId }, { $set: { ...update, updatedAt: new Date() } })
}

export async function insertAgentStep(runId: string, stepName: string, input: unknown) {
	const stepId = randomUUID()
	const { steps } = await collections()
	await steps.insertOne({
		_id: stepId,
		runId,
		stepName,
		status: 'running',
		input: input ?? null,
		startedAt: new Date(),
	})
	return stepId
}

export async function updateAgentStep(stepId: string, update: Partial<Omit<AgentStepDocument, '_id' | 'runId' | 'stepName' | 'startedAt'>>) {
	const { steps } = await collections()
	await steps.updateOne({ _id: stepId }, { $set: update })
}

export async function insertAgentEvent(runId: string, eventType: string, payload: unknown) {
	const { events } = await collections()
	await events.insertOne({
		_id: randomUUID(),
		runId,
		eventType,
		payload: payload ?? null,
		createdAt: new Date(),
	})
}

export async function getAgentSteps(runId: string) {
	const { steps } = await collections()
	return steps.find(
		{ runId },
		{ projection: { _id: 0, stepName: 1, status: 1, error: 1, startedAt: 1, completedAt: 1 } },
	).sort({ startedAt: 1 }).toArray()
}

// 旧 PostgreSQL 轨迹只回填缺失文档，保证重复启动幂等且不会覆盖 MongoDB 中的新状态。
export async function migrateLegacyAgentData(pool: Pool) {
	const { runs, steps, events } = await collections()
	const [legacyRuns, legacySteps, legacyEvents] = await Promise.all([
		pool.query('SELECT * FROM agent_runs ORDER BY created_at ASC'),
		pool.query('SELECT * FROM agent_steps ORDER BY id ASC'),
		pool.query('SELECT * FROM agent_events ORDER BY id ASC'),
	])
	if (legacyRuns.rows.length) {
		await runs.bulkWrite(legacyRuns.rows.map((row) => ({
			updateOne: {
				filter: { _id: String(row.id) },
				update: { $setOnInsert: {
					_id: String(row.id), userId: String(row.user_id), taskType: row.task_type,
					status: row.status, currentStep: row.current_step || 'queued', input: row.input,
					output: row.output, error: row.error, createdAt: row.created_at,
					updatedAt: row.updated_at, completedAt: row.completed_at,
				} },
				upsert: true,
			},
		})))
	}
	if (legacySteps.rows.length) {
		await steps.bulkWrite(legacySteps.rows.map((row) => ({
			updateOne: {
				filter: { _id: `postgres:${row.id}` },
				update: { $setOnInsert: {
					_id: `postgres:${row.id}`, runId: String(row.run_id), stepName: row.step_name,
					status: row.status, input: row.input, output: row.output, error: row.error,
					startedAt: row.started_at, completedAt: row.completed_at,
				} },
				upsert: true,
			},
		})))
	}
	if (legacyEvents.rows.length) {
		await events.bulkWrite(legacyEvents.rows.map((row) => ({
			updateOne: {
				filter: { _id: `postgres:${row.id}` },
				update: { $setOnInsert: {
					_id: `postgres:${row.id}`, runId: String(row.run_id), eventType: row.event_type,
					payload: row.payload, createdAt: row.created_at,
				} },
				upsert: true,
			},
		})))
	}
	return { runs: legacyRuns.rowCount, steps: legacySteps.rowCount, events: legacyEvents.rowCount }
}
