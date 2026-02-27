# Simply Ledger（React + FastAPI + PostgreSQL + Docker）

一个自用的记账系统：前端 React（Vite + TypeScript + MUI），后端 FastAPI（SQLAlchemy + Alembic），数据库 PostgreSQL，Docker Compose 一键部署。

## 功能概览

- 登录后使用；不对外提供注册（账号由管理员创建）
- 用户数据：邮箱、用户名、密码（密码哈希存储）
- 多语言：中文 / English / 日本語
- 主题：亮色 / 暗色
- 主打没消息就是好消息，有消息基本都是报错，操作成功通常没有提示

**收支记录**

- 记录字段：收入/支出、金额、货币、日期、备注
- 关联：可选多分类、多标签（可搜索选择）
- 标签：创建收支记录时可“输入即创建”标签
- 作废：记录支持“作废/恢复”；默认不展示作废记录（可在筛选中勾选查看）
- 搜索：收支记录搜索框仅检索“备注（note）”
- 复制：一键复制某条记录到“新建弹窗”，确认保存后才入库
- 批量操作：多选后可批量作废/恢复/删除（均有确认弹窗）
- 分类/标签联动：列表中的分类/标签可点击，自动带上筛选条件跳转/刷新

**分类 / 标签 / 用户管理**

- 分类：管理员可增删改查（普通用户可查看并用于收支记录关联）
- 标签：所有登录用户可管理；标签列表显示被收支记录使用次数（不包含作废记录）
- 用户（管理员）：创建、启用/禁用、删除、修改、重置密码；用户名列可点击跳转到该用户的收支记录列表
- 分类/标签/用户列表：支持搜索、排序、分页、多选与批量删除（带确认弹窗）

**筛选 / 排序 / 分页（重点）**

- 收支记录、全部记录：筛选区改为 `Apply` 提交后才请求接口（支持日期范围预设）
- 所有列表页的筛选值、排序规则、分页（页码 + 每页条数）都会记录到 `localStorage`，再次进入页面会自动恢复
- 当筛选条件发生变化并生效时，会自动回到第 1 页（避免“旧页码”导致空结果）

**仪表盘**

- 趋势图、收支占比饼图、分类/标签占比（金额/次数）、Top 10（支出/收入/分类/标签等）
- 管理员：可通过“用户下拉框”切换查看某个用户或全站（全局）统计；普通用户仅能看自己
- 图表交互：legend 悬停高亮、点击 toggle 显隐、点击饼图块可摘出高亮

**个人中心**

- 查看自己的用户名
- 修改邮箱/密码（需当前密码；新密码二次确认）

默认初始账号：

- 用户名：`admin`
- 密码：`123qaz`

## 快速开始（Docker）

1) 复制并修改环境变量：

```bash
cp .env.example .env
```

2) 启动（修改代码后建议强制重建/重启，避免容器未替换或浏览器缓存导致仍看到旧版）：

```bash
docker compose up -d --build --force-recreate
```

3) 初始化管理员（只需一次；已存在则跳过）：

```bash
docker compose run --rm backend python -m app.cli init-admin
```

4) 访问：

- 前端：`http://localhost:8080`
- 后端 API：`http://localhost:8000/api`（开发调试用；生产时前端通过 `/api` 反代）

## 控制台命令

重置任意用户密码：

```bash
docker compose run --rm backend python -m app.cli reset-password --username someuser --password NewPass123!
```

创建用户（运维/控制台用；系统不提供注册入口）：

```bash
docker compose run --rm backend python -m app.cli create-user --email a@b.com --username alice --password Pass123! --admin false
```

## 目录结构

- `backend/`：FastAPI + SQLAlchemy + Alembic
- `frontend/`：React（Vite）+ TypeScript + MUI + i18n + Recharts
- `docker-compose.yml`：一键部署（pgsql/backend/frontend）

