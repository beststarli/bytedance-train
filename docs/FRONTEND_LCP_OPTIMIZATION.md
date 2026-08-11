# 首页 LCP 性能优化与面试说明

## 1. 优化背景

首页最初采用完整的客户端渲染模式。浏览器需要先下载并执行 JavaScript、完成 React Hydration，再由多个 `useEffect` 请求最新文章、热门榜单和热点新闻，数据返回后才能渲染真实文章内容。

Lighthouse 报告显示，首页的 LCP 元素是文章卡片中的正文文本。因此，影响 LCP 的关键链路不是单纯的图片下载，而是：

```text
下载 HTML
  → 下载、解析并执行 JavaScript
  → React Hydration
  → 客户端请求首页数据
  → 数据返回
  → React 二次渲染文章内容
  → LCP 元素出现
```

本次优化主要围绕以下方向展开：

1. 把首页数据请求前移到服务端，消除 Hydration 后的客户端请求瀑布。
2. 并行请求互不依赖的首页数据，缩短服务端等待时间。
3. 按需加载非首屏业务模块，减少初始 JavaScript 体积。
4. 使用 `next/image` 规范图片尺寸与响应式加载。
5. 抽取服务端与客户端共享类型，降低数据结构漂移风险。

在统一的 Lighthouse 桌面端测试口径下，LCP 从 2.1s 降至约 0.9s，缩短约 57%；优化后报告同时记录 FCP 为 0.3s、TBT 为 0ms、CLS 为 0。

> 说明：优化后 Lighthouse 报告中的 LCP 展示值为 0.9s，精确值约为 0.871s；0.8s 对应 Speed Index，而不是 LCP。性能提升是整组改动共同作用的结果，在没有逐项 A/B 测试的情况下，不应声称某一项改动单独贡献了固定比例。

## 2. LCP 优化的通用分析框架

LCP 可以拆分为四段耗时：

```text
TTFB
+ 资源加载延迟
+ 资源下载耗时
+ 元素渲染延迟
= LCP
```

常见优化方向如下：

| 阶段 | 常见问题 | 优化方向 |
| --- | --- | --- |
| TTFB | 服务端处理慢、接口串行、缓存缺失 | SSR/SSG、接口并行、缓存、SQL 优化、CDN |
| 资源加载延迟 | 关键资源发现过晚 | `preload`、`preconnect`、提高 LCP 资源优先级 |
| 资源下载耗时 | 图片、字体或脚本体积过大 | AVIF/WebP、响应式图片、压缩、缓存 |
| 元素渲染延迟 | 客户端取数、JS 过大、主线程阻塞 | Server Component、按需加载、减少 Hydration 和重复渲染 |

本项目的 LCP 元素是接口数据驱动的文章正文，因此本次优化重点放在服务端取数、消除重复请求和减少首屏 JavaScript，而不是只做图片压缩。

## 3. `page.tsx` 改为 Server Component

### 3.1 改动前的问题

原来的 `page.tsx` 使用 `"use client"`，首页真实内容必须等客户端 Hydration 完成后才能请求和渲染：

```text
HTML 到达
  → JS 执行
  → Hydration
  → useEffect 请求数据
  → 渲染真实文章
```

这会把网络请求时间和二次渲染时间直接加入 LCP 链路。

### 3.2 改动后的机制

当前 `client/src/app/page.tsx` 不再声明 `"use client"`，默认成为 Server Component。它在服务端获取首页数据，并将结果作为 `initialHomeData` 传入客户端组件：

```tsx
export default async function Home() {
	const [feed, hotFeed, news] = await Promise.all([
		fetchJson("/api/content/feed?sort=new&limit=10&offset=0", { works: [] }),
		fetchJson("/api/content/feed?sort=hot&limit=5&offset=0", { works: [] }),
		fetchJson("/api/content/hot-news", { articles: [], configured: false }),
	])

	return <HomeClient initialHomeData={initialHomeData} />
}
```

优化后的链路变为：

```text
浏览器请求页面
  → Next.js 服务端获取首页数据
  → 服务端输出包含文章内容的首屏结果
  → 浏览器直接解析和绘制
  → React Hydration 接管交互
```

### 3.3 为什么能优化 LCP

- 真实文章不再等待浏览器执行 `useEffect` 后才出现。
- 服务端取数逻辑不会作为客户端 JavaScript 下发。
- 减少首屏骨架到真实内容的二次切换。
- 缩短接口数据到 LCP 文本之间的元素渲染延迟。

### 3.4 边界

当前服务端请求使用 `cache: "no-store"`，每次访问都会重新请求后端。它保证内容新鲜，但无法利用 Next.js 数据缓存；如果后端接口变慢，页面 TTFB 也会受到最慢接口影响。后续可以根据热点数据的实时性要求增加短时缓存或增量更新策略。

## 4. 使用 `Promise.all` 并行预取首页数据

最新文章、热门榜单和热点新闻之间没有依赖关系，因此不需要串行请求。

串行请求的总耗时接近各接口耗时之和：

```text
最新文章 300ms
  → 热门榜单 200ms
  → 热点新闻 400ms
总等待约 900ms
```

使用 `Promise.all` 后，三个请求同时执行，总等待时间接近最慢请求：

```text
最新文章 300ms ─┐
热门榜单 200ms ─┼→ 最慢请求完成后继续渲染
热点新闻 400ms ─┘
总等待约 400ms
```

它解决的是无依赖请求之间的等待瀑布。需要注意，接口并行会同时增加后端瞬时压力，不能把所有请求不加区分地并行化；只有互不依赖且服务端承载能力允许的请求适合这样处理。

## 5. 拆分 `home-client.tsx` 的服务端与客户端边界

Server Component 不能使用 `useState`、`useEffect`、`useCallback` 等客户端 Hook，而项目首页仍需处理菜单切换、登录弹窗、Zustand 状态、Token 刷新和侧边栏交互。

因此项目将职责拆分为：

```text
page.tsx（Server Component）
  ├── 服务端获取首页数据
  ├── 组装 initialHomeData
  └── 输出首屏内容
          ↓ Props
home-client.tsx（Client Component）
  ├── 管理菜单与弹窗状态
  ├── 处理用户交互
  ├── 恢复登录状态
  └── 按需加载业务模块
```

这一拆分的核心不是单纯移动文件，而是把“首屏数据和静态输出”留在服务端，把“必须在浏览器执行的状态与交互”限制在客户端边界内。

## 6. 使用 `next/dynamic` 按需加载非首屏模块

### 6.1 改动前的问题

首页原先静态导入创作、审核、作品、素材和用户中心等模块。即使首屏只展示内容首页，这些模块仍可能进入初始依赖图，增加 JavaScript 的下载、解析和执行成本。

### 6.2 改动后的机制

当前 `client/src/app/home-client.tsx` 使用 `next/dynamic`：

```tsx
const CreatePage = dynamic(
	() => import("@/components/createPage/createPage"),
	{ loading: WorkspaceLoading },
)

const ReviewPage = dynamic(
	() => import("@/components/reviewPage/reviewPage"),
	{ loading: WorkspaceLoading },
)
```

加载过程从“首次访问全部下载”变成：

```text
首次访问首页
  → 只加载首页必要代码

用户进入 AI 创作
  → 再加载 CreatePage 对应代码块

用户进入内容审核
  → 再加载 ReviewPage 对应代码块
```

### 6.3 为什么能优化 LCP

- 减少首屏 JavaScript 传输体积。
- 减少浏览器解析、编译和执行 JavaScript 的时间。
- 降低 Hydration 阶段的主线程压力。
- 让首屏文章更早进入可渲染状态。

### 6.4 边界

动态加载会把成本推迟到用户首次进入对应功能时，因此项目提供了 `WorkspaceLoading` 作为加载反馈。对于用户高频、进入后必须立即可用的模块，也可以在浏览器空闲时预取对应代码块，在首屏速度和后续交互速度之间取得平衡。

## 7. `mainPage.tsx` 直接消费服务端首屏数据

### 7.1 使用服务端数据初始化状态

当前首页不再以空数组和 `loading=true` 开始，而是直接使用 `initialData`：

```tsx
const [articles, setArticles] = useState(initialData?.articles ?? [])
const [loading, setLoading] = useState(!initialData)
const [hotNews] = useState(initialData?.hotNews ?? [])
const [hotArticles] = useState(initialData?.hotArticles ?? [])
```

这样首次渲染时已经具备真实文章数据，避免先渲染骨架屏、再等待客户端请求和二次更新。

### 7.2 避免 Hydration 后重复请求

项目通过 `initialSortHandled` 跳过首次相同查询：

```tsx
if (!initialSortHandled.current && initialData && sort === "new") {
	initialSortHandled.current = true
	return
}
```

否则会形成：

```text
服务端请求最新文章一次
  → Hydration
  → useEffect 再请求相同数据一次
  → loading 和内容再次更新
```

现在首屏使用服务端结果，只有用户切换排序条件后才重新发起客户端请求。这既减少重复流量，也避免首屏内容被无意义地重新渲染。

## 8. 使用 `next/image` 规范图片加载

### 8.1 明确尺寸，降低布局偏移

原生 `<img>` 如果没有明确尺寸，浏览器在图片下载前无法预留空间，图片完成后可能推动周围内容，造成 CLS。

项目中的文章图片使用明确尺寸或 `fill`：

```tsx
<Image
	src={src}
	width={1200}
	height={800}
	sizes="(max-width: 768px) 90vw, 50vw"
/>
```

浏览器可以在图片下载前确定宽高比并预留空间。

### 8.2 使用 `sizes` 选择适合的资源

`sizes` 描述图片在不同视口下的实际显示宽度。浏览器可以结合设备宽度和像素密度选择合适图片，避免在小尺寸卡片中下载过大的资源。

### 8.3 延迟加载非首屏图片

`next/image` 默认会对非关键图片使用懒加载，使浏览器优先处理视口内的首屏内容，减少非首屏图片与关键资源竞争带宽。

### 8.4 当前边界

项目对 HTTP 远程图片设置了：

```tsx
unoptimized={/^https?:\/\//.test(src)}
```

这类远程图片会绕过 Next.js 图片转换，仍能获得尺寸约束和布局稳定性，但不会自动压缩或转换成 AVIF/WebP。因此不能声称所有远程图片都经过了 Next.js 格式优化。

此外，当前 Lighthouse 的 LCP 元素是文章文字而非图片，所以图片优化主要改善资源开销和 CLS，不应被描述为本次 LCP 降低的唯一原因。

## 9. 在 `next.config.ts` 中启用 AVIF/WebP

配置如下：

```ts
images: {
	formats: ["image/avif", "image/webp"],
}
```

当图片进入 Next.js 图片优化管线后，Next.js 会根据浏览器的 `Accept` 能力进行内容协商：

```text
支持 AVIF
  → 返回 AVIF

不支持 AVIF、但支持 WebP
  → 返回 WebP

均不支持
  → 返回兼容格式
```

现代图片格式通常能在相近视觉质量下降低传输体积，从而减少下载时间和带宽占用。该配置只对经过 Next.js 图片优化管线的资源生效，对设置了 `unoptimized` 的图片不生效。

## 10. 使用 `home.ts` 统一首页数据类型

`client/src/types/home.ts` 统一定义 `FeedItem`、`HotNewsItem` 和 `HomeInitialData`，供服务端取数、客户端 Props 和首页组件共同使用：

```ts
export interface HomeInitialData {
	articles: FeedItem[]
	hotArticles: FeedItem[]
	hotNews: HotNewsItem[]
	newsConfigured: boolean
}
```

它主要解决：

- 服务端与客户端字段定义不一致。
- 重复声明类型造成维护成本。
- 使用 `any` 后无法在编译阶段发现字段变化。
- 新增首页数据时容易漏传或漏接字段。

TypeScript 类型会在构建后被删除，因此这项改动不会直接降低 LCP。它属于服务端与客户端边界调整后的工程治理措施。

## 11. 各项改动的影响优先级

| 改动 | 主要作用 | 对 LCP 的影响 |
| --- | --- | --- |
| Server Component 服务端预取 | 消除 Hydration 后客户端取数等待 | 核心 |
| `Promise.all` 并行请求 | 缩短服务端数据准备时间 | 核心 |
| `next/dynamic` 按需加载 | 减少首屏 JS 下载与执行 | 核心 |
| `initialData` 初始化并跳过重复请求 | 避免骨架切换、重复请求和二次渲染 | 核心 |
| `next/image` | 规范尺寸、响应式加载、改善 CLS | 辅助 |
| AVIF/WebP | 降低可优化图片的传输体积 | 辅助 |
| 共享类型 | 提升类型安全和可维护性 | 无直接运行时收益 |

## 12. 简历表述

> **首屏性能分析与优化**：采用服务端预取、接口并行及非首屏模块按需加载，优化图片加载；统一桌面端测试下，LCP 从 2.1s 降至 0.9s，缩短约 57%，FCP 实测 0.3s。

## 13. 面试回答参考

### 13.1 一分钟回答

> 我先通过 Lighthouse 确认首页的 LCP 元素是接口数据驱动的文章正文，原来的链路需要等待客户端 JavaScript 执行、Hydration 和 `useEffect` 请求完成。针对这个问题，我把首页拆成 Server Component 和 Client Component，由服务端使用 `Promise.all` 并行预取最新文章、热门榜单和热点新闻，再通过 `initialData` 直接驱动首屏渲染，同时跳过 Hydration 后的重复请求。
>
> 另外，我使用 `next/dynamic` 延迟加载创作、审核、作品和素材等非首屏模块，减少初始 JavaScript 的下载与执行；文章图片改用 `next/image`，设置明确尺寸和响应式 `sizes`，并为可优化资源启用 AVIF/WebP。统一 Lighthouse 桌面端测试下，LCP 从 2.1s 降至约 0.9s，减少约 57%。其中主要收益来自服务端预取和非首屏代码拆分，图片和类型改造属于配套优化。

### 13.2 常见追问

#### 为什么 Server Component 不一定降低 TTFB？

因为服务端需要先等待接口数据，再生成页面结果。它把原本发生在浏览器 Hydration 后的请求前移到了服务端，可以显著缩短元素渲染延迟，但在 `no-store` 模式下也可能增加服务端等待时间。最终效果取决于后端接口速度、网络拓扑和缓存策略。

#### 为什么不把所有模块都动态加载？

Sidebar、Header 和 MainPage 是首屏立即需要的模块，动态加载它们反而会增加额外请求和渲染等待。动态加载主要用于首屏不需要、体积较大且只有用户操作后才会出现的功能模块。

#### 骨架屏能直接降低 LCP 吗？

骨架屏主要改善感知体验，不能替代真实内容的提前渲染。较大的骨架元素甚至可能暂时成为 LCP 候选。本次优化的重点是让真实文章随首屏结果到达，而不是单纯增加骨架屏。

#### 为什么不能说 Next/Image 是 LCP 下降的主要原因？

因为当前报告中的 LCP 元素是文章文本，不是图片。`next/image` 主要降低图片资源开销、规范响应式加载并改善 CLS。只有当 LCP 元素本身是图片时，图片发现时间、优先级和下载体积才会直接决定 LCP。

#### 2.1s 到 0.9s 是如何计算提升比例的？

```text
(2.1 - 0.9) / 2.1 ≈ 57%
```

该数字应建立在相同设备类型、网络和 CPU 限速、缓存状态及 Lighthouse 版本下的前后对照测试之上。单份优化后报告只能证明当前值，不能单独证明优化幅度。

## 14. 证据与代码定位

| 内容 | 位置 |
| --- | --- |
| Server Component 与并行数据预取 | `client/src/app/page.tsx` |
| 客户端交互边界与动态加载 | `client/src/app/home-client.tsx` |
| 首屏数据消费、重复请求保护与图片组件 | `client/src/components/mainPage/mainPage.tsx` |
| AVIF/WebP 图片配置 | `client/next.config.ts` |
| 首页共享数据类型 | `client/src/types/home.ts` |

## 15. 后续优化方向

1. 保存优化前后的 Lighthouse 报告，并在相同环境下多次测试取中位数。
2. 使用真实用户 Web Vitals 数据验证实验室结果。
3. 根据实时性要求为热门榜单和热点新闻增加短时缓存。
4. 继续拆分首屏未使用的 JavaScript，验证 Lighthouse 提示的未使用代码。
5. 将可控的远程图片纳入 Next.js 图片优化管线。
6. 启用 HTTPS 和现代 HTTP 协议，进一步降低连接与资源传输开销。
