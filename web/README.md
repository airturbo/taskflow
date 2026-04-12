# TaskFlow Web

TaskFlow 的 Web 端现已按 **CloudBase 静态托管 + 本地优先 + 可选 Supabase 云同步** 的思路整理。

## 当前运行策略

- **默认可用**：打开即进入本地模式，不强制登录。
- **本地优先**：启动先读取 `localStorage`，保证国内弱网也能先用。
- **云同步降级**：如果配置了 `Supabase`，会在后台尽力同步；失败不会阻塞使用。
- **按需登录**：只有用户主动点击“登录”时才打开认证页。

## 本地开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build:web
```

构建产物输出到 `dist/`，当前 `vite.config.ts` 已设置 `base: './'`，适合部署到 CloudBase 静态托管。

## 部署到 CloudBase 静态托管

推荐流程：

1. 执行 `npm run build:web`
2. 将 `dist/` 上传到 CloudBase 静态托管
3. 使用 CloudBase 默认域名或自定义域名访问

说明：

- 当前前端已经适配静态托管的相对资源路径
- 不依赖服务端路由改写即可访问主页面
- 即使 `Supabase` 不可达，页面仍可本地使用

## 可选：启用 Supabase 云同步

在 `CloudBase` 托管前端、但暂时保留 `Supabase` 作为认证/数据库时，可配置以下环境变量：

```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

如果不配置，应用会自动退回 **纯本地模式**。

## 现在的用户体验

- **未登录**：本地模式，数据只保存在当前设备
- **已登录且网络正常**：后台尽力做云同步
- **已登录但网络异常**：继续本地使用，待恢复后自动补同步
