# 《星枢织阵 · Starloom》TapTap 上线与打包指南

本项目专为 **TapTap 开发者中心**（支持 **TapTap 网页/云玩免安装试玩** 以及 **Android APK/AAB 安装包**）设计，已内置移动端触控适配、防沉迷健康忠告、高分榜/成就 SDK 桥接层、PWA 全屏清单与标准商店美术素材。

---

## 一、快速试玩与本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev

# 运行核心逻辑单元测试 + 12波 AI 平衡性蒙特卡洛模拟
npm test

# 构建生产包（输出至 dist/，可直接上传 TapTap H5 / TapPlay）
npm run build

# 构建单文件独立试玩包（输出至 dist-single/index.html，双击即可离线游玩）
npm run build:single
```

---

## 二、方案 A：发布至 TapTap 网页即玩 / 云试玩（最快上线）

1. 执行 `npm run build` 生成 `dist/` 目录（总 JS 体积仅约 **35 KB gzip**，秒级首屏加载）。
2. 将 `dist/` 打包为 `.zip` 直接上传至 TapTap 开发者中心 Web/H5 试玩包或静态托管服务。
3. 使用 `taptap-assets/` 中已准备好的商店素材：
   - 应用图标：`taptap-assets/taptap_icon_512.png`（512×512 PNG）
   - 商店封面横幅：`taptap-assets/taptap_banner_16x9.jpg`（16:9 高清主视觉）
   - 实机高清截图：`taptap-assets/screenshots/`

---

## 三、方案 B：通过 Capacitor 打包为 TapTap Android APK / AAB

项目根目录已配置 `capacitor.config.ts`（包名 `com.starloom.bastion`）。在具备 Android Studio / JDK 17 的构建机上执行：

```bash
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```

在 Android Studio 中：
1. 在 `AndroidManifest.xml` 中将主 Activity 设置为 `android:screenOrientation="sensorLandscape"`（横屏沉浸体验）。
2. 如需接入官方 **TapSDK**（TapLogin / 成就 / 防沉迷实名认证 / TapDB），在原生 WebView 注入 `window.TapSDK` 对象并实现 `unlockAchievement(id)` 与 `submitScore(board, score)` —— `src/platform/taptap.ts` 已自动对接该桥接接口，无需修改游戏逻辑代码。
3. 执行 `Build -> Generate Signed Bundle / APK` 导出 `.apk` 或 `.aab` 上传至 TapTap 开发者后台。

---

## 四、核心合规与上架自检清单

- [x] **健康游戏忠告**：主界面底部完整展示国家新闻出版署标准健康游戏忠告。
- [x] **零外部版权风险**：所有音乐与音效均由 Web Audio API 实时程序化合成（五声调式青瓷铃音与星律和弦），全部美术为原创青瓷鎏金星盘风格。
- [x] **低端机 60fps 流畅运行**：纯高 DPI HTML5 Canvas 2D 渲染，无重型 WebGL 着色器崩溃风险，支持桌面鼠标/快捷键与手机单指点选/拖拽双模式。
- [x] **防误触与慢动作辅助**：支持「截律自动慢动作」、`1×/2×` 变速与战术暂停，移动端单手/双手皆可从容博弈。
