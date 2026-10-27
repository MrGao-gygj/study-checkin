# 学习打卡 · H5 主页

手机/电脑都能用的打卡页面：滑动分步填写、自动显示当天日期、提交后进入「打卡墙」总列表，多人实时同步。
一套代码同时是**前端页面**和**后端服务**，可直接部署到 Render 免费实例。

## 目录

| 文件 | 说明 |
| --- | --- |
| `index.html` | 前端页面（单文件、零依赖、微信内可直接打开） |
| `server/server.mjs` | 后端：打卡数据读写 + 托管页面（Node ≥ 18，零依赖） |
| `package.json` | 启动脚本：`npm start` → `node server/server.mjs` |
| `render.yaml` | Render 一键部署配置（Blueprint） |
| `启动打卡服务.cmd` | Windows 本地启动（本机 + 局域网） |
| `学习打卡表.xlsx` | 表格版备用方案（腾讯文档导入） |
| `预览/` | 手机端/电脑端效果截图 |

## 本机 / 局域网（零配置）

1. 双击 `启动打卡服务.cmd`
2. 电脑打开 `http://127.0.0.1:8787`
3. 手机连同一 WiFi，打开窗口里显示的 `http://电脑IP:8787`（首次会弹防火墙提示，选「专用网络」允许）

关窗口即停服务；数据存 `server/data.json`，不丢。

## 部署到公网（GitHub + Render 免费）

### 1. 把代码传到 GitHub

1. 登录 GitHub → 右上角 `+` → **New repository**
2. 仓库名填 `study-checkin`，选 Public（或 Private 都行）→ **Create repository**
3. 进入仓库 → **Add file → Upload files**
4. 打开本文件夹（`打卡工具`），把**里面的所有文件和 `server` 文件夹**拖进上传框 → **Commit changes**

> 仓库根目录应该能看到 `index.html`、`server/`、`render.yaml`、`package.json`。

### 2. 建一个 Gist 存打卡数据（Render 免费实例磁盘不持久，用它持久化）

1. 打开 https://gist.github.com → 文件名填 `checkins.json`，内容填：
   ```json
   {"records":[]}
   ```
2. 选 **Create secret gist**
3. 记下地址里的 Gist ID：`https://gist.github.com/你的用户名/`**`32位ID`**

### 3. 建一个 Token（只给 gist 读写权限）

1. 打开 https://github.com/settings/tokens?type=beta → **Generate new token**
2. 名称随意（如 `study-checkin`），有效期选 90 天或 No expiration
3. **Account permissions → Gists → Read and write**
4. 生成后复制 token（只显示一次）

### 4. Render 部署

1. 打开 https://render.com → **Get Started** → 用 GitHub 账号登录并授权
2. 右上角 **New +** → **Blueprint**
3. 选择 `study-checkin` 仓库 → Apply
4. 弹出环境变量时填：
   - `GIST_ID` = 第 2 步的 Gist ID
   - `GITHUB_TOKEN` = 第 3 步的 token
5. **Create** → 等待部署完成（约 1-2 分钟）

> 如果 Blueprint 不认，也可以手动：**New + → Web Service** → 选仓库 →
> Runtime 选 `Node`，Build Command 填 `npm install`，Start Command 填 `node server/server.mjs`，
> Instance Type 选 **Free**，再到 Environment 添加 `GIST_ID`、`GITHUB_TOKEN` 两个变量。

### 5. 拿到链接，发微信群

部署完成后得到 `https://study-checkin-xxxx.onrender.com`：
1. 电脑打开，试提交一次打卡
2. 切到「打卡墙」确认记录出现
3. 用手机打开同一网址确认正常
4. 把链接发到微信群，群成员点开即可同步打卡

> 免费实例 15 分钟无人访问会休眠，再次打开需要 30–60 秒唤醒，属正常现象。

## 备选部署

- **云服务器（腾讯云/阿里云轻量）**：上传文件夹 → `npm start`，用 pm2/systemd 常驻，国内访问更快。
- **不想折腾部署**：用微信原生方案 [学习打卡表.xlsx](./学习打卡表.xlsx)（导入腾讯文档，设为所有人可编辑，链接发群）。

## 配置

`index.html` 顶部 `CONFIG`：

```js
const CONFIG = {
  groupName: '一起学习打卡群',   // 群名
  remote: {
    url: location.protocol === 'file:' ? '' : '/api/checkins',  // 共享后端地址
    pollInterval: 15000          // 自动刷新间隔（毫秒）
  }
};
```

- 同域部署（本项目）：保持默认即可。
- 前后端分离：改成完整地址，如 `https://api.example.com/api/checkins`。
- 双击打开文件（file://）：自动进入本机模式。

接口约定（接自己的后端时照此实现）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/checkins` | 返回 `{"records":[...]}` |
| PUT | `/api/checkins` | 提交 `{"records":[...]}`，按 id 合并保存 |
| GET | `/health` | 健康检查 |

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 服务端口（Render 自动提供） |
| `GIST_ID` | 用 Gist 持久化时的 gist ID |
| `GITHUB_TOKEN` | 有 gist 读写权限的 token |
| `GIST_FILE` | 可选，默认 `checkins.json` |

## 数据字段

```json
{
  "id": "唯一ID",
  "date": "2026-10-27",
  "name": "张三",
  "major": "计算机",
  "planHours": 2,
  "actualHours": 1.5,
  "time": "21:30",
  "task": "今日学习任务",
  "status": "已完成 | 部分完成 | 未完成",
  "tomorrow": "明日计划",
  "createdAt": 1761570000000
}
```

## 已验证

- 手机视口（390×844）与桌面视口（1280×900）渲染正常；
- 提交 → 后端保存 → 打卡墙更新 → 顶部统计联动，全链路通过；
- 本地文件存储与 Gist 存储两条路径均有实现（Gist 需部署后在环境变量中启用）。