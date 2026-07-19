import fs from 'fs'
import path from 'path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { pool } from './db'

function storageConfig() {
	const endpoint = process.env.RUSTFS_ENDPOINT?.replace(/\/$/, '')
	const bucket = process.env.RUSTFS_BUCKET
	const publicUrl = process.env.RUSTFS_PUBLIC_URL?.replace(/\/$/, '')
	const accessKeyId = process.env.RUSTFS_ACCESS_KEY
	const secretAccessKey = process.env.RUSTFS_SECRET_KEY
	const client = endpoint && bucket && accessKeyId && secretAccessKey
		? new S3Client({
			endpoint,
			region: process.env.RUSTFS_REGION || 'us-east-1',
			forcePathStyle: process.env.RUSTFS_FORCE_PATH_STYLE !== 'false',
			credentials: { accessKeyId, secretAccessKey },
		})
		: null
	return { endpoint, bucket, publicUrl, client }
}

export function objectStorageConfigured() {
	const { client, bucket } = storageConfig()
	return Boolean(client && bucket)
}

export function objectStorageErrorMessage(error: unknown) {
	const value = error as { name?: string; code?: string; Code?: string; message?: string }
	const code = value.name || value.code || value.Code
	if (code === 'InvalidAccessKeyId') return 'RustFS Access Key 无效或不存在，请在 RustFS 控制台创建 S3 Access Key 后更新 .env'
	if (code === 'SignatureDoesNotMatch') return 'RustFS Secret Key 不正确，请重新复制完整的 Secret Key'
	if (code === 'NoSuchBucket') return 'RustFS Bucket 不存在，请检查 RUSTFS_BUCKET'
	if (code === 'ECONNREFUSED' || value.message?.includes('ECONNREFUSED')) return '无法连接 RustFS，请检查服务状态和 RUSTFS_ENDPOINT'
	return `RustFS 上传失败${code ? `（${code}）` : ''}`
}

function objectUrl(key: string) {
	return `/api/content/assets/${key}`
}

export async function saveUpload(key: string, buffer: Buffer, contentType: string) {
	const { client, bucket } = storageConfig()
	if (client && bucket) {
		await client.send(new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: buffer,
			ContentType: contentType,
		}))
		return objectUrl(key)
	}

	const uploadDir = path.join(__dirname, '../../uploads')
	if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
	fs.writeFileSync(path.join(uploadDir, path.basename(key)), buffer)
	return `/uploads/${path.basename(key)}`
}

export async function deleteUpload(url?: string | null) {
	if (!url) return
	const { client, bucket, endpoint, publicUrl } = storageConfig()
	if (client && bucket && !url.startsWith('/uploads/')) {
		const proxyPrefix = '/api/content/assets/'
		const publicPrefix = publicUrl ? `${publicUrl}/` : `${endpoint}/${bucket}/`
		const key = url.startsWith(proxyPrefix)
			? url.slice(proxyPrefix.length)
			: url.startsWith(publicPrefix) ? url.slice(publicPrefix.length) : ''
		if (key) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
		return
	}
	if (url.startsWith('/uploads/')) {
		const filePath = path.join(__dirname, '../../uploads', path.basename(url))
		if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
	}
}

export async function getUpload(key: string) {
	const { client, bucket } = storageConfig()
	if (!client || !bucket) throw new Error('RustFS 未配置')
	const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
	if (!result.Body) throw new Error('资源不存在')
	return {
		body: Buffer.from(await result.Body.transformToByteArray()),
		contentType: result.ContentType || 'application/octet-stream',
		etag: result.ETag,
	}
}

export async function migrateLocalUploadsToObjectStorage() {
	const { client, bucket } = storageConfig()
	if (!client || !bucket) return
	const uploadDir = path.join(__dirname, '../../uploads')

	// 修复已迁移素材对应文章正文中的旧 /uploads 链接。
	// 旧版本只更新了 materials.url，导致作品 Markdown 仍指向已删除的本地文件。
	const { rows: storedMaterials } = await pool.query(
		"SELECT url FROM materials WHERE url NOT LIKE '/uploads/%'"
	)
	for (const material of storedMaterials) {
		let filename = ''
		try {
			filename = path.basename(new URL(material.url).pathname)
		} catch {
			filename = path.basename(material.url)
		}
		if (!filename) continue
		const legacyUrl = `/uploads/${filename}`
		const proxyUrl = objectUrl(`materials/${filename}`)
		await pool.query(
			`UPDATE works
			 SET content = REPLACE(content, $1, $2), updated_at = NOW()
			 WHERE content LIKE '%' || $1 || '%'`,
			[legacyUrl, proxyUrl],
		)
		await pool.query(
			`UPDATE works
			 SET content = REPLACE(content, $1, $2), updated_at = NOW()
			 WHERE content LIKE '%' || $1 || '%'`,
			[material.url, proxyUrl],
		)
		await pool.query('UPDATE materials SET url = $1 WHERE url = $2', [proxyUrl, material.url])
	}

	const { rows: remoteUsers } = await pool.query(
		"SELECT id, avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE '/uploads/%' AND avatar_url NOT LIKE '/api/content/assets/%'"
	)
	for (const user of remoteUsers) {
		let filename = ''
		try {
			filename = path.basename(new URL(user.avatar_url).pathname)
		} catch {
			filename = path.basename(user.avatar_url)
		}
		if (filename) await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [objectUrl(`avatars/${filename}`), user.id])
	}

	if (!fs.existsSync(uploadDir)) return

	const { rows: materials } = await pool.query(
		"SELECT id, url, type FROM materials WHERE url LIKE '/uploads/%'"
	)
	for (const material of materials) {
		const localPath = path.join(uploadDir, path.basename(material.url))
		if (!fs.existsSync(localPath)) continue
		const key = `materials/${path.basename(material.url)}`
		const mime = material.type === 'video' ? 'video/mp4' : 'image/jpeg'
		const url = await saveUpload(key, fs.readFileSync(localPath), mime)
		await pool.query('UPDATE materials SET url = $1 WHERE id = $2', [url, material.id])
		await pool.query(
			`UPDATE works
			 SET content = REPLACE(content, $1, $2), updated_at = NOW()
			 WHERE content LIKE '%' || $1 || '%'`,
			[material.url, url],
		)
		fs.unlinkSync(localPath)
	}

	const { rows: users } = await pool.query(
		"SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/uploads/%'"
	)
	for (const user of users) {
		const localPath = path.join(uploadDir, path.basename(user.avatar_url))
		if (!fs.existsSync(localPath)) continue
		const key = `avatars/${path.basename(user.avatar_url)}`
		const url = await saveUpload(key, fs.readFileSync(localPath), 'image/jpeg')
		await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, user.id])
		fs.unlinkSync(localPath)
	}

}
