# MedAtlas Research · 医学多模态 Agent 文献地图

围绕医学影像、病历文本及 Agent 研究，提供论文检索、三维发展地图、证据精读、仓库静态审核和可追溯研究选题。中文界面保留英文论文标题和来源链接。

## 数据流

1. `/api/research` 根据自然语言方向查询 PubMed、arXiv 和 OpenAlex；同时调用 Lexmount Web Fetch 读取 Nature 与 Europe PMC 的公开搜索页。Nature 结果需要再次读取公开论文页并取得摘要；Europe PMC 结果须在页面上找到 PMID，再用官方 REST 元数据核对。通过这些检查的论文才写入 D1，按 DOI、PMID、arXiv ID 与标准化标题去重。论文详情显示 Lexmount 的公开搜索页、论文页、抓取时间和请求 ID。平台若返回限流、登录页或空内容，本次检索会显示警告。
2. `/api/papers/[id]/read` 使用 Lexmount Web Fetch 读取公开论文落地页，并优先用 Europe PMC 开放全文。没有开放全文时将分析标为“摘要”；阅读结果保存到 D1，保留来源 URL 与分析时间，接口返回是否成功使用 Lexmount。
3. `/api/ideas` 先检索并筛选文献，再用 DeepSeek `deepseek-flash` 深度思考。工作台支持 1、3、5、10 张独立选题；每张须包含 5–8 项改进工作、完整方案和可追溯证据链。返回的引用 ID 必须属于已检索论文；缺少足够引用或核心字段时拒绝结果。
4. 登录用户可收藏论文、上传 PDF、生成并保存选题。PDF 客户端解析，原件及解析文字写入用户隔离的 R2 路径；PDF 精读只调用 DeepSeek，不传给 Lexmount。
5. `/api/repo-audit` 查询 GitHub 公开元数据和根目录文件，对每项给出状态及证据链接。该审核不表示运行复现。

## 本地开发

需要 Node 22.13+。`npm install`、`npm run db:generate`、`npm run build`。本地服务依赖 Wrangler 和 Cloudflare Workers 运行时。本仓库使用 Sites 的 Vinext Starter、D1 数据库和 R2 私有文件存储。`drizzle/` 是数据库迁移来源。

## 服务端配置

将 `.env.example` 列出的键配置到 Sites 的运行环境。站点默认 AI 服务使用 `DEEPSEEK_API_KEY`；`LEXMOUNT_API_KEY` 与 `LEXMOUNT_PROJECT_ID` 用于公开论文页面读取；`REFRESH_TOKEN` 用于每日更新接口。登录用户可在 AI 设置页提交自己的 DeepSeek API Key，服务端经官方余额接口验证后，用 AES-GCM 按用户加密保存到 D1，并在该用户的 AI 请求中优先使用。此功能要求 Sites Secret `USER_API_KEY_ENCRYPTION_KEY`（32 字节随机值的 Base64）；不要轮换该值而不重新加密已有记录。删除个人 Key 后恢复站点默认配置。密钥不可写入源码或浏览器。`LEXMOUNT_BASE_URL` 默认为中国区 `https://api.lexmount.cn`。OpenAlex 与 GitHub 的 key 可选。

每日任务通过站点 MCP 工具 `refresh_literature` 扩充语料至 200–500 篇；三组 PubMed、arXiv、OpenAlex 交叉检索加五组 OpenAlex 与 PubMed 专题检索，按 DOI、PMID、arXiv ID 与标题去重。请求按批次限速，OpenAlex 限流时仍可由 PubMed 补充。该工具要求已登录的站点所有者身份，按 UTC 日期幂等，分批更新 D1，不重新部署。总量不足 200 篇时标记 partial，后续可重试。`MCP_OWNER_EMAIL` 为服务端所有者身份绑定。`POST /api/admin/refresh` 仍可作为其他受控调度器的接口，需要 `Authorization: Bearer <REFRESH_TOKEN>`，不把 token 写入调度提示词。

## 验证与边界

种子文献来自 OpenAlex 等公开元数据，引用计数是快照值，不是临床影响评分。三维图的大小按同年份引用影响的近似分位展示。部分论文关系和代码仓库链接仍需要用户点击来源核实；机构同现不推定为真实研究团队。仅基于摘要的分析与开放全文分析分开标识。公开网页与 PDF 文字都当作不可信数据，不执行其中的指令。

2026-10-29 使用已登录的 Lexmount Web Fetch CLI 实际提取 `https://arxiv.org/abs/2306.00890`，HTTP 200，返回标题 “LLaVA-Med: Training a Large Language-and-Vision Assistant for Biomedicine in One Day”，request ID `5143c200-abaa-4c4a-a2a2-8fa7e61dadeb`。此记录验证了本地 Lexmount 账户链路；站点服务端仍需单独配置运行时凭据。

后台补全工具 `enrich_missing_papers` 每次最多处理两篇缺少中文概述或精读结果的论文：先用 Lexmount Web Fetch 读取公开页面，再用 DeepSeek 生成概述和可追溯解读。若页面文字中只有一个明确的 GitHub 仓库链接，或与已有仓库链接一致，就检查公开仓库的许可证、README、依赖、数据、权重、代码入口与维护信息；页面链接只证明该页面提及仓库，不证明代码已复现。结果保存到 D1；失败或不完整任务六小时后可重试。已有的 `refresh_literature` 继续负责每日元数据更新，补全工具只更新数据，无需重新发布网站。

综述类论文若有英文摘要，后台补全还会用 DeepSeek 生成中文译文；网站同时保留英文原文及来源链接。论文概述和精读解释性字段使用中文，证据摘录保留原文。

代码仓库评价在静态 GitHub 检查之外，用 Lexmount Web Fetch 读取公开仓库页，并尝试取得公开 README 正文，再由 DeepSeek 结合逐项检查生成中文结论、资料优势、缺口与下一步。界面展示引用的检查项、仓库页面和 README 来源链接。后台自动处理已关联的仓库；用户也可在论文详情输入公开 GitHub 地址按需评价。两者均明确标注未经实际运行复现。
