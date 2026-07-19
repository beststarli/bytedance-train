# RustFS 资源存储

项目的头像和素材上传已接入 RustFS 的 S3 兼容接口。未配置 RustFS 时，开发环境仍会写入 `server/uploads`。

## 配置

先在 RustFS 创建 Bucket，并确保后端账号拥有 `PutObject`、`DeleteObject` 权限。然后在项目根目录 `.env` 中配置：

```env
RUSTFS_ENDPOINT=http://rustfs:9000
RUSTFS_ACCESS_KEY=your-access-key
RUSTFS_SECRET_KEY=your-secret-key
RUSTFS_BUCKET=bytedance-train
RUSTFS_REGION=us-east-1
RUSTFS_FORCE_PATH_STYLE=true
RUSTFS_PUBLIC_URL=https://assets.example.com/bytedance-train
```

`RUSTFS_PUBLIC_URL` 必须是浏览器可以访问的 Bucket 或 CDN 地址。RustFS 需要为这些资源配置公开读取，或由 CDN/反向代理负责读取授权。

## 现有资源迁移

后端启动且 RustFS 配置完整时，会自动检查数据库中以 `/uploads/` 开头的素材和头像：

1. 上传到 `materials/` 或 `avatars/` 对象前缀；
2. 更新数据库 URL；
3. 成功后删除对应本地文件。

迁移过程是幂等的；已经使用对象存储 URL 的记录不会重复迁移。
