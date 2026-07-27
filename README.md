# 🏡 萌宠小镇 · 虚拟宠物养成（前后端分离版）

**前后端完全分离**的虚拟宠物养成小游戏：前端只负责渲染与交互，所有宠物状态、时间衰减、等级成长等逻辑都运行在**后端**，前端通过 `fetch('/api/pet')` 调用。后端存储走**适配层**，以后换 Redis / 腾讯云 CloudBase 只改一个文件。

## ✨ 功能
- 🐱 宠物三状态：饱食度 / 心情 / 精力（0–100）
- 🍖 喂食 · 🎾 玩耍 · 😴 睡觉 · ✏️ 改名 · 🔄 重置
- ⏳ 状态随真实时间自然衰减（衰减在**后端**按时间戳回算）
- 🏆 照顾次数累计 → 等级成长
- 🔌 清晰的 REST 风格接口：`GET /api/pet`、`POST /api/pet`

## 🗂 目录结构（前后端分离）
```
mengpet-town/
├─ index.html          # 前端页面
├─ styles.css          # 样式
├─ app.js              # 视图层：只渲染 + 绑事件，调 lib/api.js
├─ lib/
│  └─ api.js           # 前端 API 客户端（本地仅存 petId，状态全在后端）
├─ api/
│  ├─ pet.js           # Vercel Serverless 入口（映射 /api/pet）
│  ├─ _petCore.js      # 业务核心：状态/衰减/互动（与框架无关，本地云端共用）
│  └─ _store.js        # 存储适配层（默认内存，可换 Redis/CloudBase）
├─ dev-server.js       # 本地一体化服务器（静态 + /api）
├─ package.json
└─ README.md
```

## 🚀 本地运行（无需 Vercel）
```bash
node dev-server.js
# 打开 http://localhost:3000
```

## 🌐 部署到 Vercel
1. 把本仓库推到 GitHub（部署需你本地 `git push`，本环境网络受限无法代推）。
2. 打开 [vercel.com](https://vercel.com) → GitHub 登录 → **Add New → Project** → 选本仓库 → **Deploy**。
3. 拿到 `https://项目名.vercel.app`，分享即可。Vercel 会自动把 `api/pet.js` 部署成 `/api/pet` 接口。

## 🔄 接真实持久化（多人共享同一只宠物）
当前后端用**内存存储**（Vercel 冷启动会清零，仅演示）。要持久化、要多人共享：
1. 打开 `api/_store.js`，把 `get/save` 换成 Upstash Redis 或腾讯云 CloudBase（接口不变）。
2. 前端、核心逻辑、Vercel 配置**都不用动**。
> 注意：现在每个浏览器靠本地 `petId` 区分宠物；要做"公共宠物/账号体系"，需在 `_petCore.js` 增加账号维度。

## 📌 备注
- 免费版 Vercel 仅限个人非商用；商业化请升级 Pro 或迁国内云。
- `vercel.app` 在大陆可能不稳，正式对国内用户请走 CloudBase + 备案。
