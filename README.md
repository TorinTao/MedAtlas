# MedAtlas Research · 医学多模态 Agent 文献地图

围绕医学影像、病历文本及 Agent 研究，提供论文检索、三维发展地图、证据精读、仓库静态审核和 3 个可追溯研究选题。中文界面保留英文论文标题和来源链接。

## 数据流

1. `/api/research` 根据自然语言方向查询 PubMed、arXiv 和 OpenAlex，按 DOI、PMID、arXiv ID 与标准化标题去重；初始界面还有带来源的种子文献。用户查询写入 D1。
2. `/api/papers/[id]/read` 使用 Lexmount Web Fetch 读取公开论文落地页，并优先用 Europe PMC 开放全文。没有开放全文时将分析标为“摘要”；阅读结果保存到 D1，保留来源 URL 与分析时间，接口返回是否成功使用 Lexmount。
3. `/api/ideas` 调用 DeepSeek `deepseek-flash`，每次产生 3 个 idea。返回的引用 ID 必须属于本站已检索的论文；缺少足够引用或核心字段时拒绝结果。
4. 登录用户可收藏论文、上传 PDF、生成并保存选题。PDF 客户端解析，原件及解析文字写入用户隔离的 R2 路径；PDF 精读只调用 DeepSeek，不传给 Lexmount。
5. `/api/repo-audit` 查询 GitHub 公开元数据和根目录文件，对每项给出状态及证据链接。该审核不表示运行复现。

## 本地开发

需要 Node 22.13+。`npm install`、`npm run db:generate`、`npm run build`。本地服务依赖 Wrangler 和 Cloudflare Workers 运行时。本仓库使用 Sites 的 Vinext Starter、D1 数据库和 R2 私有文件存储。`drizzle/` 是数据库迁移来源。

## 服务端配置

将 `.env.example` 列出的键配置到 Sites 的运行环境。必需项：`DEEPSEEK_API_KEY`、`LEXMOUNT_API_KEY`、`LEXMOUNT_PROJECT_ID`；`REFRESH_TOKEN` 用于每日更新接口。密钥不可写入源码或浏览器。`LEXMOUNT_BASE_URL` 默认为中国区 `https://api.lexmount.cn`。公开检索无需以上密钥，但精读与选题生成需要它们。OpenAlex 与 GitHub 的 key 可选。

每日任务调用 `POST /api/admin/refresh` 并使用 `Authorization: Bearer <REFRESH_TOKEN>`；接口按 UTC 日期幂等，更新 D1，不重新部署。应由具备独立安全凭据的云端任务执行，不把 token 写入调度提示词。

## 验证与边界

种子文献来自 OpenAlex 等公开元数据，引用计数是快照值，不是临床影响评分。三维图的大小按同年份引用影响的近似分位展示。部分论文关系和代码仓库链接仍需要用户点击来源核实；机构同现不推定为真实研究团队。仅基于摘要的分析与开放全文分析分开标识。公开网页与 PDF 文字都当作不可信数据，不执行其中的指令。

2026-10-29 使用已登录的 Lexmount Web Fetch CLI 实际提取 `https://arxiv.org/abs/2306.00890`，HTTP 200，返回标题 “LLaVA-Med: Training a Large Language-and-Vision Assistant for Biomedicine in One Day”，request ID `5143c200-abaa-4c4a-a2a2-8fa7e61dadeb`。此记录验证了本地 Lexmount 账户链路；站点服务端仍需单独配置运行时凭据。
