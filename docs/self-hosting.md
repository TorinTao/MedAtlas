# 个人服务器部署

此部署保留 Sites 版本的 Worker 代码，通过固定版本的 Miniflare / workerd 在 Ubuntu 上运行，D1 与 R2 的数据分别持久化到本地 SQLite 和文件目录。这是单服务器个人实例；Miniflare 原本用于 Worker 本地运行，不具备托管平台的高可用和多租户运维保障。

## 访问

在自己的电脑运行：

```sh
ssh -N -L 5180:127.0.0.1:5180 ubuntu@39.106.14.223
```

保持终端打开，然后访问 `http://localhost:5180`。网关只监听服务器的 `127.0.0.1`，自动以 `torin` 映射到原工作区。SSH 是访问边界，不提供站内注册或登录；不要把该端口转发到公网，也不要直接给它加公开反向代理。公开多人部署需要独立身份系统和 HTTPS。

## 目录

| 路径 | 内容 |
| --- | --- |
| `/home/ubuntu/coding/med-atlas` | 源码与 `dist/` 构建结果 |
| `/home/ubuntu/coding/medatlas-data` | 本地 D1、R2 和迁移校验报告 |
| `/home/ubuntu/coding/medatlas-backups/snapshots` | Sites 的原始数据库与文件快照 |
| `/home/ubuntu/coding/medatlas-backups/artifacts` | 构建包、最小运行依赖和 Git 传输包 |
| `/home/ubuntu/.config/medatlas/config.json` | 用户映射、运行配置与服务端密钥，权限 600 |

配置供应商密钥时，通过交互式 SSH 输入，内容不会回显：

```sh
ssh -t ubuntu@39.106.14.223 'python3 ~/coding/med-atlas/deployment/self-host/configure.py'
```

## 服务维护

```sh
sudo systemctl status medatlas
sudo systemctl restart medatlas
journalctl -u medatlas -n 80 --no-pager
curl http://127.0.0.1:5180/healthz
```

`healthz` 只返回数据库状态和供应商是否配置，不返回密钥。修改代码后需要重新构建 `dist/` 再重启；该服务器内存有限，建议在开发机完成构建后传入。更新源码时保留独立的数据目录和配置文件。

### 低内存服务器的更新方式

在 Linux x64 开发机上构建网站，并运行 `node deployment/self-host/package-runtime.mjs /tmp/medatlas-runtime-linux-x64.tar.gz`。它从已经安装的锁定依赖中打包 Miniflare 的运行依赖，不包含整套前端开发工具。把构建结果与运行依赖传到服务器后再解压，服务器上不执行 `npm ci` 或前端构建。

服务器已设置 2 GiB 交换空间。服务限制为 50% 单核 CPU、640 MiB 内存上限、512 MiB swap 上限，并降低 CPU/I/O 调度优先级；五分钟内连续三次失败后停止自动重试。交换空间只作内存缓冲，不等于扩大了物理内存。导入与解压也应使用独立资源限额，并观察现有应用的状态。

## 迁移与备份

迁移接口 `/api/admin/migration` 默认关闭；只有设置独立的 `MIGRATION_EXPORT_TOKEN` 与未来的 `MIGRATION_EXPORT_UNTIL` 后可读。数据库通过一个 D1 batch 事务导出全部业务表；文件逐个下载并计算 SHA-256。接口不导出平台环境密钥。完成后移除迁移变量并重新部署旧站，立即关闭导出访问。

`deployment/self-host/import.mjs` 仅接受空目标数据库，逐表检查恢复内容的 SHA-256，逐文件检查内容和大小。报告保存在数据目录的 `migration-verified.json`。保留各记录的原用户 ID，展示用户映射到同一 ID，不把其他用户的数据合并进来。旧站和新站在快照之后的修改不会自动同步。

备份运行中的实例时，先停止 `medatlas` 服务，再同时备份数据目录和配置文件，完成后启动服务。配置中的加密密钥与数据库应一同保留。旧站已有后台任务保持其原有启停状态；此次迁移不会自动启动原本停用的任务。
