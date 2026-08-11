import { Db, MongoClient } from 'mongodb'

let client: MongoClient | undefined
let database: Db | undefined

export async function connectMongo() {
	if (database) return database
	const uri = process.env.MONGODB_URI?.trim()
	if (!uri) {
		throw new Error('缺少 MONGODB_URI；Compass 不是必需的，但需要可访问的 MongoDB 服务')
	}
	client = new MongoClient(uri, {
		appName: 'bytedance-train',
		// MongoDB 是可降级的 Agent 轨迹存储，启动探测不能阻塞认证服务几十秒。
		serverSelectionTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 3000),
		connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 3000),
	})
	await client.connect()
	database = client.db(process.env.MONGODB_DATABASE?.trim() || 'bytedance_train')
	await database.command({ ping: 1 })
	return database
}

export async function closeMongo() {
	await client?.close()
	client = undefined
	database = undefined
}
