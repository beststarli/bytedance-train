"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectStorageConfigured = objectStorageConfigured;
exports.objectStorageErrorMessage = objectStorageErrorMessage;
exports.saveUpload = saveUpload;
exports.deleteUpload = deleteUpload;
exports.getUpload = getUpload;
exports.migrateLocalUploadsToObjectStorage = migrateLocalUploadsToObjectStorage;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const db_1 = require("./db");
function storageConfig() {
    const endpoint = process.env.RUSTFS_ENDPOINT?.replace(/\/$/, '');
    const bucket = process.env.RUSTFS_BUCKET;
    const publicUrl = process.env.RUSTFS_PUBLIC_URL?.replace(/\/$/, '');
    const accessKeyId = process.env.RUSTFS_ACCESS_KEY;
    const secretAccessKey = process.env.RUSTFS_SECRET_KEY;
    const client = endpoint && bucket && accessKeyId && secretAccessKey
        ? new client_s3_1.S3Client({
            endpoint,
            region: process.env.RUSTFS_REGION || 'us-east-1',
            forcePathStyle: process.env.RUSTFS_FORCE_PATH_STYLE !== 'false',
            credentials: { accessKeyId, secretAccessKey },
        })
        : null;
    return { endpoint, bucket, publicUrl, client };
}
function objectStorageConfigured() {
    const { client, bucket } = storageConfig();
    return Boolean(client && bucket);
}
function objectStorageErrorMessage(error) {
    const value = error;
    const code = value.name || value.code || value.Code;
    if (code === 'InvalidAccessKeyId')
        return 'RustFS Access Key 无效或不存在，请在 RustFS 控制台创建 S3 Access Key 后更新 .env';
    if (code === 'SignatureDoesNotMatch')
        return 'RustFS Secret Key 不正确，请重新复制完整的 Secret Key';
    if (code === 'NoSuchBucket')
        return 'RustFS Bucket 不存在，请检查 RUSTFS_BUCKET';
    if (code === 'ECONNREFUSED' || value.message?.includes('ECONNREFUSED'))
        return '无法连接 RustFS，请检查服务状态和 RUSTFS_ENDPOINT';
    return `RustFS 上传失败${code ? `（${code}）` : ''}`;
}
function objectUrl(key) {
    return `/api/content/assets/${key}`;
}
async function saveUpload(key, buffer, contentType) {
    const { client, bucket } = storageConfig();
    if (client && bucket) {
        await client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
        return objectUrl(key);
    }
    const uploadDir = path_1.default.join(__dirname, '../../uploads');
    if (!fs_1.default.existsSync(uploadDir))
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
    fs_1.default.writeFileSync(path_1.default.join(uploadDir, path_1.default.basename(key)), buffer);
    return `/uploads/${path_1.default.basename(key)}`;
}
async function deleteUpload(url) {
    if (!url)
        return;
    const { client, bucket, endpoint, publicUrl } = storageConfig();
    if (client && bucket && !url.startsWith('/uploads/')) {
        const proxyPrefix = '/api/content/assets/';
        const publicPrefix = publicUrl ? `${publicUrl}/` : `${endpoint}/${bucket}/`;
        const key = url.startsWith(proxyPrefix)
            ? url.slice(proxyPrefix.length)
            : url.startsWith(publicPrefix) ? url.slice(publicPrefix.length) : '';
        if (key)
            await client.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return;
    }
    if (url.startsWith('/uploads/')) {
        const filePath = path_1.default.join(__dirname, '../../uploads', path_1.default.basename(url));
        if (fs_1.default.existsSync(filePath))
            fs_1.default.unlinkSync(filePath);
    }
}
async function getUpload(key) {
    const { client, bucket } = storageConfig();
    if (!client || !bucket)
        throw new Error('RustFS 未配置');
    const result = await client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body)
        throw new Error('资源不存在');
    return {
        body: Buffer.from(await result.Body.transformToByteArray()),
        contentType: result.ContentType || 'application/octet-stream',
        etag: result.ETag,
    };
}
async function migrateLocalUploadsToObjectStorage() {
    const { client, bucket } = storageConfig();
    if (!client || !bucket)
        return;
    const uploadDir = path_1.default.join(__dirname, '../../uploads');
    // 修复已迁移素材对应文章正文中的旧 /uploads 链接。
    // 旧版本只更新了 materials.url，导致作品 Markdown 仍指向已删除的本地文件。
    const { rows: storedMaterials } = await db_1.pool.query("SELECT url FROM materials WHERE url NOT LIKE '/uploads/%'");
    for (const material of storedMaterials) {
        let filename = '';
        try {
            filename = path_1.default.basename(new URL(material.url).pathname);
        }
        catch {
            filename = path_1.default.basename(material.url);
        }
        if (!filename)
            continue;
        const legacyUrl = `/uploads/${filename}`;
        const proxyUrl = objectUrl(`materials/${filename}`);
        await db_1.pool.query(`UPDATE works
			 SET content = REPLACE(content, $1, $2), updated_at = NOW()
			 WHERE content LIKE '%' || $1 || '%'`, [legacyUrl, proxyUrl]);
        await db_1.pool.query(`UPDATE works
			 SET content = REPLACE(content, $1, $2), updated_at = NOW()
			 WHERE content LIKE '%' || $1 || '%'`, [material.url, proxyUrl]);
        await db_1.pool.query('UPDATE materials SET url = $1 WHERE url = $2', [proxyUrl, material.url]);
    }
    const { rows: remoteUsers } = await db_1.pool.query("SELECT id, avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE '/uploads/%' AND avatar_url NOT LIKE '/api/content/assets/%'");
    for (const user of remoteUsers) {
        let filename = '';
        try {
            filename = path_1.default.basename(new URL(user.avatar_url).pathname);
        }
        catch {
            filename = path_1.default.basename(user.avatar_url);
        }
        if (filename)
            await db_1.pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [objectUrl(`avatars/${filename}`), user.id]);
    }
    if (!fs_1.default.existsSync(uploadDir))
        return;
    const { rows: materials } = await db_1.pool.query("SELECT id, url, type FROM materials WHERE url LIKE '/uploads/%'");
    for (const material of materials) {
        const localPath = path_1.default.join(uploadDir, path_1.default.basename(material.url));
        if (!fs_1.default.existsSync(localPath))
            continue;
        const key = `materials/${path_1.default.basename(material.url)}`;
        const mime = material.type === 'video' ? 'video/mp4' : 'image/jpeg';
        const url = await saveUpload(key, fs_1.default.readFileSync(localPath), mime);
        await db_1.pool.query('UPDATE materials SET url = $1 WHERE id = $2', [url, material.id]);
        await db_1.pool.query(`UPDATE works
			 SET content = REPLACE(content, $1, $2), updated_at = NOW()
			 WHERE content LIKE '%' || $1 || '%'`, [material.url, url]);
        fs_1.default.unlinkSync(localPath);
    }
    const { rows: users } = await db_1.pool.query("SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/uploads/%'");
    for (const user of users) {
        const localPath = path_1.default.join(uploadDir, path_1.default.basename(user.avatar_url));
        if (!fs_1.default.existsSync(localPath))
            continue;
        const key = `avatars/${path_1.default.basename(user.avatar_url)}`;
        const url = await saveUpload(key, fs_1.default.readFileSync(localPath), 'image/jpeg');
        await db_1.pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, user.id]);
        fs_1.default.unlinkSync(localPath);
    }
}
//# sourceMappingURL=objectStorage.js.map