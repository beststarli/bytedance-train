# 首页文章流：纵向无限滚动与懒加载面试深挖

## 一、项目背景与设计动机

首页原先一次只请求 10 篇文章。用户看到第一页后，即使继续向下滚动也不会加载更多内容。直接一次性查询全部文章虽然实现简单，但随着数据增长，会同时放大数据库查询、接口响应体积、网络传输、JSON 解析、React 渲染和图片下载成本。

因此我把文章流设计为“首屏 SSR + 客户端分批加载 + 纵向无限滚动”：

1. Next.js Server Component 在首屏请求前 10 条，保证首次内容可直接出现在 HTML 中。
2. 浏览器水合后，由客户端组件接管交互。
3. 用户向下滚动，距离文章列表底部约 300px 时，自动请求下一批数据。
4. 新数据追加到已有列表末尾，不替换旧数据，也不展示页码或左右翻页控件。
5. 没有更多数据时停止观察并展示“已经到底了”。

这里的“分页”是数据层的分批读取手段，用户体验仍然是类似内容社区的连续纵向信息流。

## 二、为什么需要同时做 SSR 和客户端懒加载

如果所有数据都在客户端 `useEffect` 中请求，首屏必须经历 HTML 到达、JavaScript 下载、React 水合、接口请求完成后才能看到文章，会影响 FCP 和用户感知速度，也不利于搜索引擎读取首屏正文。

如果全部由服务端一次性返回，又失去了按需加载的收益。因此采用混合方案：

- 服务端负责第一批：优化首屏、SEO 和弱网体验。
- 客户端负责后续批次：使用浏览器 API 感知滚动位置并增量追加。
- `HomeInitialData` 同时携带 `articles`、`total` 和 `has_more`，客户端无需重复请求第一页，也不会盲目假设一定存在下一页。

这体现了 Server Component 与 Client Component 的职责划分：靠近数据源、无需交互的首屏请求放在服务端；依赖状态、生命周期和 `IntersectionObserver` 的部分放在客户端。

## 三、整体数据链路

```text
首次访问
  -> Next.js page.tsx 在服务端请求 offset=0&limit=10
  -> 服务端 HTML/RSC 携带首批文章及 has_more
  -> 浏览器水合 ContentHome
  -> IntersectionObserver 观察列表底部哨兵节点
  -> 哨兵进入列表视口前 300px
  -> 请求 offset=当前已加载数量&limit=10
  -> 按文章 id 去重后追加
  -> 更新 total 和 has_more
  -> has_more=true：继续观察；false：停止请求
```

## 四、为什么使用 IntersectionObserver，而不是监听 scroll

传统方案是在 `scroll` 事件中反复计算：

```ts
scrollTop + clientHeight >= scrollHeight - threshold
```

但滚动事件触发频率很高，如果每次都读取布局属性、执行 React 状态判断，容易给主线程增加压力；若读写 DOM 交错，还可能触发强制同步布局。开发者通常还要额外实现节流。

`IntersectionObserver` 采用“观察目标与视口是否相交”的模型。浏览器统一调度可见性检测，业务代码只在相交状态变化时收到回调，不需要每一帧手动计算位置。

本项目在列表末尾放置一个 sentinel 哨兵节点：

```tsx
<div ref={loadMoreRef}>继续向下滚动加载更多</div>
```

并配置：

```ts
new IntersectionObserver(callback, {
  root: scrollContainerRef.current,
  rootMargin: "300px 0px",
  threshold: 0,
})
```

### 参数原理

- `root`：相交检测的视口。本页面真正滚动的是文章列表内部的 `overflow-y-auto` 容器，而不是 `window`，因此必须显式传入列表元素。
- `rootMargin`：在真实视口外围扩展观察区域。底部提前扩展 300px，可以预取下一页，让请求和渲染尽量在用户真正触底前完成。
- `threshold: 0`：目标只要刚进入扩展后的观察区域就触发，不要求完整可见。
- cleanup：effect 清理时执行 `observer.disconnect()`，避免排序切换或组件卸载后残留观察器。

## 五、分页接口设计

当前接口返回：

```ts
interface FeedPage<T> {
  works: T[]
  total: number
  has_more: boolean
}
```

请求参数为：

```text
GET /api/content/feed?sort=new&limit=10&offset=20
```

- `limit` 控制每批数量，服务端限制在 1～50，防止客户端传入超大值拖垮接口。
- `offset` 表示服务端查询窗口已经读取到的位置。前端单独维护 `nextOffset`，不能直接使用去重后的列表长度，否则动态数据造成重复项时，展示数量不增长，会反复请求同一个窗口。
- `has_more` 由 `offset + limit < total` 计算，前端不需要通过“返回条数是否等于 pageSize”猜测是否还有下一页。
- `total` 用于展示整体数量，也能帮助监控数据是否异常。

### 为什么当前选择 offset

项目后端原本已经支持 offset，当前数据规模较小，因此复用现有接口能以较低复杂度完成可靠的无限滚动。

但 offset 有两个限制：

1. 页数很深时，数据库仍需扫描并丢弃前面大量记录，深分页性能下降。
2. 加载期间若有新文章插入到列表顶部，后续 offset 可能产生重复或遗漏。

因此前端额外按 `id` 去重，解决可见的重复问题；如果进入大规模生产环境，应升级为 cursor/keyset pagination。

## 六、为什么排序必须稳定

分页查询必须具备确定性顺序。如果只写：

```sql
ORDER BY created_at DESC
```

两篇文章的 `created_at` 相同，数据库没有义务保证它们每次以相同顺序返回，跨页时可能重复或漏项。因此加入唯一字段作为最终 tie-breaker：

```sql
ORDER BY created_at DESC, id DESC
```

点赞和热度排序同样处理：

```sql
ORDER BY like_count DESC, created_at DESC, id DESC
ORDER BY hot_score DESC, created_at DESC, id DESC
```

这并不能完全消除动态指标变化带来的排名漂移，但能保证相同排序值下结果稳定。

## 七、前端状态机与并发控制

无限滚动不能只维护一个 `loading`，至少要区分：

- `loading`：首次加载或切换排序，列表进入整体加载态。
- `loadingMore`：列表仍保留，只在底部展示增量加载状态。
- `hasMore`：是否允许继续加载。
- `loadMoreFailed`：增量请求失败，停止观察器自动重试，改为用户点击重试，避免接口故障时形成请求风暴。
- `total`：接口总数。

### 为什么同时使用 state 和 ref 锁

React 状态更新不是同步互斥锁。同一轮事件循环中，观察器回调可能在 `setLoadingMore(true)` 生效前再次进入。如果只判断 state，可能重复发出相同 offset 的请求。

因此使用同步 ref：

```ts
if (loadingMoreRef.current) return
loadingMoreRef.current = true
```

请求结束后再释放。state 用于驱动 UI，ref 用于同步防重入，两者职责不同。

### 排序切换的竞态

典型竞态：用户正在加载“最新发布”第二页，随后切换到“最多点赞”；旧请求比新请求更晚返回，如果直接写入 state，会把旧排序数据混进新列表。

解决方式是维护请求代次 `requestGenerationRef`：

1. 每次重新加载排序时递增 generation。
2. 请求发出时捕获当前 generation。
3. 响应返回时对比；不一致说明响应已过期，直接丢弃。

相比只使用布尔 `cancelled`，generation 也能覆盖同一组件内多批并行请求的逻辑隔离。更进一步可以在 API 层传递 `AbortSignal`，主动取消网络请求，减少带宽消耗；但即使取消失败，响应提交前仍要做版本校验。

## 八、为什么追加时还要按 ID 去重

当前使用 offset，而首页数据会动态变化。例如第一页请求完成后，有一篇新文章发布并插入顶部，第二页相同 offset 对应的窗口整体后移，就可能再次返回第一页末尾的数据。

追加逻辑先构建已有 ID 集合：

```ts
setArticles((current) => {
  const existingIds = new Set(current.map(item => item.id))
  const incoming = page.works.filter(item => !existingIds.has(item.id))
  return [...current, ...incoming]
})
```

使用函数式更新是为了读取提交时的最新 state，而不是请求发出时闭包中可能过期的数组。

去重只能避免重复展示，不能找回 offset 导致的遗漏，所以大规模场景仍应使用游标分页。

## 九、Cursor/Keyset Pagination 如何升级

“最新发布”可以将最后一项的 `created_at + id` 编码为游标：

```json
{
  "createdAt": "2026-08-17T10:00:00.000Z",
  "id": "work-id"
}
```

下一页查询：

```sql
WHERE status = 'published'
  AND (created_at, id) < ($cursorCreatedAt, $cursorId)
ORDER BY created_at DESC, id DESC
LIMIT $limit
```

游标可以 Base64 URL-safe 编码，使客户端把它当作不透明字符串。服务端必须校验游标格式，不能直接拼接 SQL。

优势：

- 不需要扫描并跳过前 N 行，深分页性能更稳定。
- 列表顶部插入新文章不会改变“从最后一项继续”的位置。
- 结合 `(created_at, id)` 复合索引可以高效定位。

限制：

- 不适合任意跳到第 N 页，但无限滚动本来也不需要页码跳转。
- 点赞数、浏览量、动态热度会变化。以动态字段作为 cursor 时，项目必须接受弱一致的信息流，或在首次请求时生成 feed snapshot/version，后续都基于同一快照读取。

## 十、数据库索引与 SQL 性能

最新文章流可建立部分复合索引：

```sql
CREATE INDEX idx_works_published_created_id
ON works (created_at DESC, id DESC)
WHERE status = 'published';
```

但当前查询还对 reactions 做聚合，热度和点赞排序需要 `COUNT FILTER`，数据量增大后每次现算成本较高。可进一步：

1. 将 `like_count`、`favorite_count` 维护为作品表的冗余计数器，互动事务中原子增减。
2. 将 hot score 定时计算并写入字段或物化视图。
3. 对热点榜单使用短 TTL 缓存，因为它不要求强一致。
4. 通过 `EXPLAIN (ANALYZE, BUFFERS)` 验证是否命中索引，而不是只凭 SQL 形式判断性能。

冗余计数带来一致性成本，需要幂等 reaction 记录、唯一约束以及定期对账修正。

## 十一、图片懒加载与数据懒加载的区别

本功能主要解决“数据懒加载”：文章数据按批请求。

列表图片使用 Next.js `Image`。非 priority 图片默认按需加载，并生成合适的图片属性；因此不应再给每张卡片图片设置 `priority`，否则会让所有图片抢占首屏带宽。

还应注意：代码中远程图片配置了 `unoptimized`，这意味着浏览器仍会下载原始资源，数据量大时应配置可信远程域名，让 Next 图片优化生效，或者在素材上传阶段生成缩略图，列表只请求缩略图，详情再加载原图。

## 十二、无限滚动不等于虚拟列表

无限滚动降低的是单次网络与首次渲染成本，但已加载文章仍会一直留在 DOM 中。用户滚动很久后，DOM 节点、图片和 React Fiber 数量仍会增长。

当列表达到数百或上千项、Profiler 显示提交耗时和内存明显上升时，应引入虚拟列表：只渲染视口附近元素，并用占位高度维持滚动条。文章卡片高度相对固定时实现简单；高度动态时需要测量和缓存尺寸，并处理图片加载后的高度变化。

不应一开始就同时引入虚拟化，因为它会增加滚动定位、可访问性、动态高度、弹窗返回位置等复杂度。先用性能数据证明瓶颈再升级。

## 十三、失败处理与用户体验

- 首次请求失败：展示空态或错误态，不能伪装成“没有文章”。当前项目后续可进一步把首次错误与空数据拆开。
- 加载更多失败：保留已加载内容，底部显示“点击重试”。不自动无限重试，避免故障时形成请求风暴。
- 到达末尾：展示“已经到底了”，同时不再创建观察器触发请求。
- 提前预取：使用 300px rootMargin 隐藏网络延迟，但数值应结合卡片高度、接口 P95 和用户滚动速度调优。
- 可访问性：底部状态容器使用 `aria-live="polite"`，辅助技术可以感知加载结果；重试使用真实 button。

## 十四、常见面试追问

### 1. 为什么不用防抖后的 scroll 事件？

可以用，但需要手动读取滚动尺寸、处理节流和不同滚动容器。IntersectionObserver 更符合“目标是否接近视口”的语义，也由浏览器统一调度。若需要连续滚动进度、吸顶动画等每帧信息，scroll 事件仍然适合。

### 2. IntersectionObserver 回调在哪个线程执行？

回调最终仍在主线程执行 JavaScript，并不是把业务回调放到独立线程；优势在于相交计算和通知由浏览器优化、批量调度，避免应用在每个 scroll 事件里同步测量布局。

### 3. rootMargin 为什么不是 threshold？

`rootMargin` 改变判定视口边界，用于提前预取；`threshold` 表示目标可见面积比例。加载更多通常关心“提前接近”，所以 rootMargin 更直接。

### 4. 为什么不能只判断返回数量小于 pageSize？

可以作为简单协议，但服务端可能因为过滤、权限、去重只返回较少数据，同时后面仍有记录。显式 `has_more/next_cursor` 能把分页语义交给掌握查询条件的服务端。

### 5. 如何防止重复请求？

三层保护：`hasMore` 阻止末页请求；同步 ref 锁防止 observer 重入；请求 generation 防止过期响应污染新排序。同时分页读取进度与去重后的展示数量分离，防止重复窗口导致 offset 停滞。服务端接口本身仍应保持幂等读取。

### 6. React 为什么使用函数式 setState？

异步请求返回时，闭包捕获的 articles 可能已经过期。函数式更新接收 React 提交时的最新 state，适合在现有列表基础上追加、去重或更新互动状态。

### 7. 无限滚动对 SEO 有什么影响？

搜索引擎未必会模拟不断滚动，因此重要内容不能只存在于无限滚动之后。项目用 SSR 输出第一页保证基础可索引性。如果公开内容依赖搜索流量，还应为文章提供独立 URL，并可提供可爬取的分页链接或 sitemap；无限滚动只是交互层增强。

### 8. 如何恢复用户返回前的滚动位置？

可以在离开页面时记录滚动容器的 `scrollTop`、当前排序和已加载页数据；返回时先恢复数据，再在布局完成后设置 scrollTop。若使用路由页面，也可以利用路由框架的 scroll restoration。需要控制缓存上限，避免把大量正文长期保存在内存或 sessionStorage。

### 9. 为什么列表接口不应该返回完整正文？

当前项目为了生成摘要直接返回 content，但生产环境应返回专用的 `excerpt` 和 `cover_thumbnail_url`。列表只传展示所需字段，点击详情后再请求完整正文，能够显著减少响应体、JSON 解析和客户端内存占用。

### 10. 如何验证优化真的有效？

前端观察 FCP/LCP、接口资源大小、React Profiler commit 时间、长任务和内存；后端观察接口 P50/P95/P99、SQL 执行时间、扫描行数、缓存命中率和错误率。使用固定数据规模对比一次性全量加载与每批 10/20 条的性能，而不是只凭体感判断。

## 十五、面试中的完整回答示例

> 首页文章数量增长后，如果一次返回全部数据，数据库查询、网络传输、JSON 解析和 React 首次渲染都会线性增长。我把它改成了首屏 SSR 与客户端无限滚动结合的方案：Next.js 服务端先取 10 条，保证首屏和 SEO；客户端用 IntersectionObserver 观察文章列表内部的底部哨兵，root 指向真正的 overflow 滚动容器，并用 300px rootMargin 提前预取下一批。接口返回 works、total 和 has_more，下一批用当前已加载数量作为 offset，新结果通过函数式 setState 按 id 去重后追加。前端区分首次 loading、loadingMore、hasMore 和失败重试状态，并用同步 ref 锁防止 observer 重入，用 request generation 丢弃排序切换后的过期响应。后端为每种排序补充 id 作为最终 tie-breaker，保证排序确定性。当前复用 offset 是为了控制改造成本；大数据量时会升级为 created_at + id 的 keyset pagination 并增加复合索引。无限滚动只解决分批加载，不会限制 DOM 总量，因此当长列表 Profiler 数据出现瓶颈时，再引入虚拟列表。图片方面使用 Next Image 的原生懒加载，并计划让列表只返回缩略图与摘要，详情再取完整正文。

这套回答既说明了用户体验，也覆盖了渲染、浏览器 API、React 并发竞态、接口协议、SQL 稳定性和后续演进路径。
