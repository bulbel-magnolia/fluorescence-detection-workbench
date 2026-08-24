# Supabase 团队协作配置

云端能力是可选模块。本地检测、文件导入和历史记录在未配置或离线时继续工作。

## 1. 创建托管项目

在组织拥有的 Supabase 项目中启用邮箱登录。开发、演示和正式环境应使用不同项目。

桌面客户端只配置公开值：

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

不要把 service role key 写入 `.env`、前端代码、安装包或 Git。

## 2. 应用数据库迁移

迁移文件：

```text
supabase/migrations/202607180001_workspace_rls.sql
```

它创建：

- `profiles`
- `workspaces`
- `workspace_memberships`
- `detection_records`
- `sync_requests`
- `is_workspace_member`
- `is_workspace_admin`
- `create_workspace`
- 对应 RLS 策略

使用已登录并关联到目标项目的 Supabase CLI 执行迁移。部署前先在开发项目审阅 SQL：

```powershell
supabase link --project-ref <project-ref>
supabase db push
```

## 3. 部署 Edge Functions

```powershell
supabase functions deploy sync-record
supabase functions deploy invite-member
```

托管函数环境必须提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`。service role 仅在服务端用于经过用户鉴权和成员/管理员校验后的操作。

## 4. 建立首个工作区

用户注册或受邀登录后，可调用：

```sql
select public.create_workspace('BIT-CHINA');
```

该函数原子创建工作区，并将当前用户加入为 `admin`。后续邀请通过 `invite-member` 执行，函数会再次校验调用者的活动管理员身份。

## 5. 同步语义

- 本地记录先写 SQLite。
- 登录且属于工作区后，记录进入同步队列。
- 每次操作生成稳定幂等键。
- `sync-record` 在服务端校验 JWT 和工作区成员身份。
- 服务端以 `workspace_id + record_id` upsert。
- 删除使用软删除时间，避免离线重试产生歧义。
- 重试采用指数退避，上限五分钟。

## 6. 安全检查

- anon key 可存在客户端，权限必须由 RLS 约束。
- service role key 不进入客户端。
- 不关闭 RLS 以绕过权限问题。
- 不在日志中输出 JWT、刷新令牌或完整私有数据。
- 用户会话在 Tauri 中写入 Windows Credential Manager。
- 邀请、删除和角色修改应在独立开发项目中验证后再用于正式工作区。
