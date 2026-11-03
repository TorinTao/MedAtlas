# MedAtlas · 医学多模态研究星图

围绕医学影像、病历文本及 Agent 研究，提供论文检索、发展地图、证据精读、仓库静态审核和可追溯研究选题。

## 从哪里开始

- 理解代码：阅读 [模块地图与替换指南](docs/architecture.md)。
- 配置与维护：阅读 [数据流程与运行说明](docs/operations.md)。
- 查看网站：https://medatlas-research-2026.zhouxiuzhuang.chatgpt.site

## 目录导航

| 目录 | 内容 |
| --- | --- |
| `app/` | 页面、交互入口、HTTP 与 MCP 路由 |
| `modules/` | 七个业务模块及所属界面组件 |
| `composition/` | 服务组装、跨模块流程与后台作业 |
| `platform/` | 外部 API、身份、存储及 Sites 运行时适配 |
| `shared/` | 共享模型、接口和纯工具 |
| `db/`、`drizzle/` | 数据库 schema 与迁移历史 |
| `data/` | 启动文献和补充语料，运行时仍在使用 |
| `tests/` | 模块测试、路由回归及测试运行环境 |
| `scripts/` | 测试检查、构建、安装与 Sites 预览支持 |
| `docs/` | 架构及运行文档 |
| `public/`、`vendor/` | 静态资源及带许可证的基础样式 |
| `worker/` | Cloudflare Worker 入口 |

## 开发与验证

需要 Node.js 22.13+。本地预览还需要系统能够运行 Cloudflare workerd。

```sh
npm ci
npm run typecheck
npm test
npm run test:module -- workspace
npm run dev
npm run build
```

`npm run db:generate` 仅在修改数据库 schema 后生成新迁移，不是每次构建的前置步骤。已有迁移及快照应保留。

`.env.example` 仅列出配置名称；真正凭据放在部署平台的服务端 Secret 或未跟踪的本地配置中。`dist/`、`.next/`、`.wrangler/` 等是忽略的生成文件或本地运行状态，不纳入源码。用户上传文件和线上数据不在本次源码清理范围内。

类型检查会阻止未使用的变量、参数和导入；`npm test` 同时检查模块依赖边界与循环依赖。
