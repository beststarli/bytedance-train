# 字节跳动2026工程训练营——前端方向今日头条业务
![image1](./image1.png)
在内容创作领域，AIGC（人工智能生成内容）技术正以前所未有的深度和广内容消费的每一个环节。对于个人创作者和中小团队而言，如何高效、合规、优质度，重塑着从灵感迸发到地利用 AI 能力，打造从内容生产到分发的全链路闭环，成为一个极具价值的挑战。

我们设想一个平台，它不仅是创作者的得力助手，能辅助完成从创意构思、素材整合、多模态内容（如长文、短图文、种草内容等）生成的全过程，更是一个智能的“守门员”和“导航员”。它需要内建一套由 AI 驱动的内容安全与质量管控体系，在创作的各个阶段自动识别并干预潜在的合规风险，同时对内容的质量进行评估，为后续的精准分发提供决策依据。

最终，平台还应具备热点追踪和内容榜单功能，让优质内容能够脱颖而出，并为创作者提供数据反馈，形成一个从创作、审核、分发到优化的良性循环。
![image2](./image2.png)

## 网站地址

## 功能介绍

### 项目文档

- [创作与内容审核 Agent 架构](./docs/AGENT_ARCHITECTURE.md)
- [AI Agent 架构面试八股与项目深挖](./docs/AI_AGENT_INTERVIEW_GUIDE.md)
- [AIGC 平台全栈面试深挖](./docs/INTERVIEW_DEEP_DIVE.md)
- [RustFS 对象存储说明](./docs/RUSTFS_STORAGE.md)
- [MongoDB Agent 轨迹存储](./docs/MONGODB.md)

## 本地启动
### 前端

### 后端

### RustFS
```bash
rustfs server \
  --address :9000 \
  --console-enable \
  --console-address :9001 \
  --access-key admin \
  --secret-key 123456 \
  --region us-east-1 \
  /Users/beststar/data
```

## 技术细节
### 双token无感刷新
这个项目使用 Access Token 和 Refresh Token 实现登录认证及无感刷新。用户登录成功后，服务端会生成两枚 JWT：Access Token 默认有效期是 15 分钟，Refresh Token 默认有效期是 7 天。
Access Token 通过响应体返回，前端保存在 Zustand 内存中；Refresh Token 通过 Set-Cookie 写入浏览器。Refresh Cookie 设置了 HttpOnly，降低 Token 被前端恶意脚本直接读取的风险；生产环境启用 Secure，只允许通过 HTTPS 发送；同时设置 SameSite=Lax，降低部分 CSRF 风险。
Refresh Token 中包含唯一的 jti。服务端不会保存 Refresh Token 明文，而是把 jti、Token 哈希、用户 ID、过期时间和撤销时间保存到数据库。需要注意，jti 标识的是一枚 Refresh Token，不是设备 ID。这样既能校验刷新会话，也能主动撤销 Refresh Token。
前端调用普通业务接口时，会在 Authorization: Bearer `<access-token>` 请求头中携带 Access Token。服务端验证它的签名、有效期以及 Token 类型，验证成功后从 Payload 中获得用户身份。
对普通请求，如果 Access Token 过期导致服务端返回 401，统一 API 封装会调用 Refresh 接口。刷新成功后，服务端返回新的 Access Token，同时采用 Refresh Token Rotation 签发新的 Refresh Token，并撤销旧 Refresh Token；前端随后使用新的 Access Token，把原业务请求重试一次。
如果多个请求同时收到 401，前端通过模块级的 refreshPromise 实现 SingleFlight。第一个请求真正发起刷新，其他请求等待同一个 Promise，而不是分别调用 Refresh 接口。刷新成功后，它们共享新的 Access Token，并分别重试各自的原请求。
这么做很重要，因为 Refresh Token 采用一次性轮换。如果多个请求同时使用旧 Refresh Token，第一个请求成功后就会撤销旧 Token，后续刷新可能失败并清除登录状态。共享 Promise 可以避免单个标签页内的这种并发轮换冲突。
对 SSE 请求，因为长连接建立后不方便再走普通的 401 重试流程，所以前端会在建立连接前解析 Access Token 的过期时间。如果 Token 已经过期，或者距离过期不足 30 秒，就先刷新 Token，再发起 SSE 请求。
如果 Refresh Token 本身已经过期、被撤销或者不合法，那么无感刷新就无法继续。所有等待同一个刷新 Promise 的请求都会收到刷新失败结果，前端统一清除认证状态，要求用户重新登录。

## Bug修复
***欢迎在Issue中向我反馈Bug，我会尽快修复。***
