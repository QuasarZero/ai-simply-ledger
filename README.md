# Simply Ledger（React + FastAPI + PostgreSQL + Docker）

一个自用的记账系统：前端 React（Vite + TypeScript + MUI），后端 FastAPI（SQLAlchemy + Alembic），数据库 PostgreSQL，Docker Compose 一键部署。

## 功能概览

- 登录后使用；不对外提供注册（账号由管理员创建）
- 用户数据：邮箱、用户名、密码（密码哈希存储）
- 多语言：中文 / English / 日本語
- 主题：亮色 / 暗色

### 收支记录

- 列表展示：包含 `ID` 列；支持按表头排序（含 `ID`）
- 记录字段：收入/支出、金额、货币、日期、备注（日期选择支持 Year → Month → Day 逐级选择；日历头“年在前、月在后”）
- 关联：可选多分类、多标签（可搜索选择）
- 标签：创建收支记录时可“输入即创建”标签
- 分类字段（自定义属性）：选择分类后，表单会展示该分类定义的字段；字段值支持下拉搜索选择历史值
- 作废：记录支持“作废/恢复”；默认不展示作废记录（可在筛选中勾选查看）
- 搜索：收支记录搜索框仅检索“备注（note）”
- 复制：一键复制某条记录到“复制弹窗”，复制时日期自动设为“今天”，确认保存后才入库
- 批量操作：多选后可批量作废/恢复/删除（均有确认弹窗）
- 批量设置分类：多选后可批量覆盖分类关联（可清空）
- 分类/标签联动：列表中的分类/标签可点击，自动带上筛选条件跳转/刷新
- 快捷键：弹窗 `Ctrl+Enter` 提交；筛选区输入框回车触发 `Apply`

### 分类

- 分类：管理员可增删改查；支持管理“分类字段”（字段名 + 是否必填）；列表显示“字段数”并支持排序

### 标签

- 标签：所有登录用户可管理；标签列表显示被收支记录使用次数（不包含作废记录）

### 用户

- 用户（管理员）：创建、启用/禁用、删除、修改、重置密码；用户名列可点击跳转到该用户的收支记录列表

### 列表管理通用功能

- 收支记录、全部记录：筛选区改为 `Apply` 提交后才请求接口（支持日期范围预设：今日/昨日/近几日/本周/本月/今年/去年/自定义/全部等；其中“全部”表示不做日期筛选）
- 所有列表页的筛选值、排序规则、分页（页码 + 每页条数）都会记录到 `localStorage`，再次进入页面会自动恢复
- 当筛选条件发生变化并生效时，会自动回到第 1 页（避免“旧页码”导致空结果）
- 当按 `categoryId` 筛选收支记录时：列表会动态展示该分类的字段列，并支持按字段列排序和筛选
- 管理列表页支持搜索、排序、分页、多选与批量删除（带确认弹窗）

### 仪表盘

- 趋势图、收支占比饼图、分类/标签占比（金额/次数）、Top 10（支出/收入/分类/标签等）
- 管理员：可通过“用户下拉框”切换查看某个用户或全站（全局）统计；普通用户仅能看自己
- 图表交互：legend 悬停高亮、点击 toggle 显隐、点击饼图块可摘出高亮
- Top 10 报表：分类/标签按“标签（Chip）”样式展示，可点击跳转到收支列表并自动带上 `categoryId/tagId`（管理员会跳到全站收支页）

### 汇率 / 货币

- 货币清单：管理员可在 `Admin > Currencies` 管理系统支持的货币（开启/关闭）
- 汇率落库：管理员可在 `Admin > FX rates` 选择日期范围进行同步（按天存储，USD 基准）
- 服务商链路：同步会按照 `.env` 的 `FX_PROVIDERS` 顺序依次抓取并“补齐缺失的日期/货币”，已补齐就不会继续调用后续服务商（节省用量）
- 限流处理：服务商返回 `429` 时会临时跳过该服务商，继续尝试后续服务商
- 同步进度：同步以任务（job）运行，页面会显示进度条/当前服务商；刷新页面会自动恢复轮询该任务状态
- 统计换算：仪表盘/统计只使用数据库的 `fx_rates`（会按“就近取 <= 交易日期”的汇率进行计算；若缺失会提示需要先同步）

### 个人中心

- 查看自己的用户名
- 修改邮箱/密码（需当前密码；新密码二次确认）

如果不手动更新 .env 配置文件，则默认初始账密为：

- 用户名：`admin`
- 密码：`123qaz`

## 找回密码（邮件）

- 登录页提供“忘记密码”入口，通过邮箱发送重置链接
- 开发环境可使用 `EMAIL_MODE=log`，重置链接会打印到后端容器日志（便于本地测试）
- 生产环境需要配置为 `EMAIL_MODE=smtp`

## 快速开始（Docker）

1. 复制并修改环境变量：

    ```bash
    cp .env.example .env
    ```

2. 启动（修改代码后建议强制重建/重启，避免容器未替换或浏览器缓存导致仍看到旧版）：

    ```bash
    docker compose up -d --build --force-recreate
    ```

3. 初始化管理员（只需一次；已存在则跳过）：

    ```bash
    docker compose run --rm backend python -m app.cli init-admin
    ```

4. 访问：

- 前端：`http://localhost:8080`
- 后端 API：`http://localhost:8000/api`（开发调试用；生产时前端通过 `/api` 反代）

## 环境变量说明（节选）

`.env.example` 是模板文件，运行时请复制为 `.env` 并填写真实值。

- `FX_PROVIDERS`：汇率服务商链路（按顺序补齐缺失数据）
- `OPENEXCHANGERATES_APP_ID`：OpenExchangeRates API key（仅在启用该 provider 时需要）
- `FREECURRENCYAPI_KEY`：FreeCurrencyAPI key（仅在启用该 provider 时需要）
- `FX_CURRENCIES`：**仅用于系统首次初始化时**默认启用的货币列表；后续由数据库 `currencies` 表管理开关

## 时区（重要）

系统时区通过 `.env` 的 `TIMEZONE` 控制（默认 `Asia/Shanghai`，即东八区）。`docker-compose.yml` 会把它应用到：

- PostgreSQL：设置容器 `TZ`，并通过启动参数设置 `timezone`
- 后端：设置容器 `TZ`，并把 `TIMEZONE` 传给后端配置（用于日期筛选边界/默认日期范围）

## 控制台命令

重置任意用户密码：

```bash
docker compose run --rm backend python -m app.cli reset-password --username someuser --password NewPass123!
```

创建用户（运维/控制台用；系统不提供注册入口）：

```bash
docker compose run --rm backend python -m app.cli create-user --email a@b.com --username alice --password Pass123! --admin false
```

## 业务日志 / 报错日志

- 容器内日志目录由 `LOG_DIR` 控制（默认在 Compose 中为 `/app/logs`）
- 宿主机会映射到项目根目录同级的 `./logs/`
- 按天落文件：
  - `logs/audit-YYYY-MM-DD.log`：业务操作日志（登录/退出、增删改、批量操作等）
  - `logs/error-YYYY-MM-DD.log`：运行过程中的异常与堆栈（如果有）

## 目录结构

- `backend/`：FastAPI + SQLAlchemy + Alembic
- `frontend/`：React（Vite）+ TypeScript + MUI + i18n + Recharts
- `docker-compose.yml`：一键部署（pgsql/backend/frontend）
