# Spine Previewer Web

一个运行在浏览器里的 Spine 资源预览工具。上传 Spine 导出的 skeleton、atlas 和贴图文件后，可以直接预览动画、切换皮肤、检查 slot / bone / attachment 信息，并对选中的 bone 做简单调整。

## 功能特性

- 按文件内容识别 JSON / 二进制骨架，支持 `.json`、`.skel`、`.bytes`、`.txt`
- 自动识别 Spine 导出版本，按需加载对应运行库
- 支持上传 `.atlas` 文件
- 支持上传一张或多张 `.png`、`.jpg`、`.jpeg`、`.webp` 贴图
- 按 atlas 页面逐一匹配贴图，缺图或同名歧义时明确报错
- 按 atlas 的 `pma` 字段设置透明模式，支持手动指定 PMA / 直通 Alpha
- 支持切换动画和 skin
- 支持播放、暂停、循环播放、重置姿势和重新居中
- 支持点击模型部位，查看命中的 slot、bone、attachment 信息
- 支持调整当前 slot 对应 bone 的 `x`、`y`、`rotation`、`scaleX`、`scaleY`
- 支持显示 Bounding Box 调试轮廓
- 支持单独隐藏或显示 slot
- 支持导出当前姿势 PNG 和 setup pose PNG

## 在线使用

项目是纯前端应用，不需要后端服务。部署到 Vercel、Netlify 或其他静态托管平台后即可通过浏览器访问。

> 资源文件只在浏览器本地读取，不会上传到服务器。

## 本地运行

```bash
npm install
npm run dev
```

启动后按终端提示打开本地地址，通常是：

```text
http://localhost:5173
```

## 构建

```bash
npm run build
```

构建产物会输出到：

```text
dist/
```

本地预览生产构建：

```bash
npm run preview
```

## 部署到 Vercel

Vercel 可以直接识别这个 Vite 项目，通常保持默认配置即可。

```text
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

## 使用方式

1. 选择 skeleton 文件，例如 `.json`、`.skel` 或 `.bytes`
2. 选择对应的 `.atlas` 文件
3. 选择 atlas 引用的贴图文件
4. 根据资源需要调整 skeleton scale；旧 atlas 没有 `pma` 标记而显示发黑或异常时，可手动选择贴图透明模式
5. 点击加载 Spine
6. 加载成功后可以切换动画、skin、点击模型部位或导出 PNG

## 资源版本说明

程序从 JSON 的 `skeleton.spine` 或二进制版本头读取导出版本，选择对应运行库，不会修改资源里的版本号。

| Spine 导出版本 | JSON | 二进制 `.skel` / `.bytes` |
| --- | --- | --- |
| 3.7 | 支持 | 尚未接入 |
| 3.8、4.0、4.1 | 支持 | 支持 |
| 4.2、4.3 | 支持 | 支持 |

缺失版本、其他版本和不支持的格式会明确报错。当前未覆盖 2.x 和 3.1～3.6，不代表已达到 EX Studio 的全部兼容范围。

为让这些运行库共享同一渲染器，项目使用 PixiJS 7.4.3；3.7～4.1 使用对应的 `@pixi-spine/runtime-*`，4.2 / 4.3 使用按版本固定的官方 `spine-pixi-v7`。

## 点击检测说明

点击检测会优先使用 Spine 资源中的 Bounding Box attachment。  
如果没有 Bounding Box，程序会尝试根据 region / mesh 顶点做近似命中检测。

为了获得更准确的点击区域，建议在 Spine Editor 中为需要点击的部位添加 Bounding Box。

## 注意事项

- 右侧的 Bone 调整面板修改的是当前 slot 对应的 bone，不是 slot 本身
- 一个 bone 可能控制多个 slot，因此调整后多个部位可能一起变化
- atlas 中的 page 名称需要和贴图文件名对应；支持路径分隔符、大小写和唯一 basename 匹配
- 缺少页面贴图或存在多个同名候选时停止加载，不再使用第一张图替代
- 自动透明模式按每页的 `pma` 字段设置；没有标记时使用直通 Alpha。手动选项应用到所有页
- 本工具主要用于预览和调试，不会修改原始 Spine 资源文件

## 技术栈

- [Vite](https://vitejs.dev/)
- [PixiJS](https://pixijs.com/)
- [spine-pixi-v7](https://github.com/EsotericSoftware/spine-runtimes)
- [pixi-spine](https://github.com/pixijs-userland/spine)

## 验证

```bash
npm test
npm run build
```

单元测试覆盖 JSON / 二进制版本识别、损坏或未知版本、atlas 多页解析、PMA 选择、缺图和同名歧义。

## License

未指定。使用或分发前请根据你的项目需要补充许可证说明。
