# 记账系统（React + FastAPI + PostgreSQL + Docker）

## 功能概览
- 必须登录后使用；无对外注册，账号由管理员创建
- 管理员：用户管理（创建/禁用/反禁用/删除/修改/查看）、分类/标签管理、管理所有收支记录
- 普通用户：只能看到/管理自己创建的收支记录
- 收支记录：可选多分类（可搜索选择）、多标签（可搜索选择）、备注、货币（默认人民币）
- 收支记录支持“作废”：默认只显示未作废记录；可在筛选中勾选查看作废记录，并可恢复
- 标签：在创建收支记录时可直接输入并创建（无需先去标签管理页）
- 图表统计：支持日期范围筛选
- 仪表盘：收支占比饼图、分类/标签占比（金额/次数）、Top10 榜单（最高花费记录/分类/标签、出现次数最高的分类/标签）
- 多语言：中文/英文
- 主题：亮色/暗色切换
- 控制台命令：初始化管理员、重置任意用户密码

默认初始账号：
- 用户名：`admin`
- 密码：`123qaz`

## 快速开始（Docker）
1) 复制并修改环境变量：
```bash
cp .env.example .env
```

2) 启动：
```bash
docker compose up -d --build
```

3) 初始化管理员
- 默认在 `backend` 容器启动时会自动执行一次初始化（已存在则跳过）
- 也可以手动执行（只需一次；已存在则跳过）：
```bash
docker compose run --rm backend python -m app.cli init-admin
```

4) 打开页面：
- 前端：`http://localhost:8080`
- 后端 API：`http://localhost:8000/api`（开发调试用，生产时前端通过 `/api` 反代）

## 管理员入口
登录后，管理员在左上角菜单里可以进入：
- `全部记录`：查看/删除所有用户的记录
- `分类/标签/用户`：增删改查与重置密码

## 控制台命令
重置密码（管理员/任何用户均可用该命令重置）：
```bash
docker compose run --rm backend python -m app.cli reset-password --username someuser --password NewPass123!
```

创建用户（不对外注册，必须管理员创建；此命令用于运维/控制台）：
```bash
docker compose run --rm backend python -m app.cli create-user --email a@b.com --username alice --password Pass123! --admin false
```

## 目录结构
- `backend/` FastAPI + Alembic
- `frontend/` React(Vite) + MUI + i18n + 图表
- `docker-compose.yml` 一键部署（pgsql/backend/frontend）
