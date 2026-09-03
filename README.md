# Spine 预览器

这是一个本地运行的 Spine 预览器项目，支持：

- 上传 `.json` / `.skel`
- 上传 `.atlas`
- 上传一个或多个贴图 `.png/.jpg/.webp`
- 切换动画 / skin
- 拼合多个 skin（例如同时套用 `a + b`）
- 点击部位查看 `slot / bone / attachment`
- 修改当前 slot 对应 bone 的 `x / y / rotation / scaleX / scaleY`
- 显示 Bounding Box 调试轮廓

## 运行方式

```bash
npm install
npm run dev
```

然后在浏览器打开本地地址。

## 依赖版本注意

Spine 运行时的 **major.minor** 版本要与你导出资源的 Spine Editor **major.minor** 版本对应。

当前项目默认：

```json
"@esotericsoftware/spine-pixi-v8": "~4.2.0",
"pixi.js": "^8.16.0"
```

页面里的“运行时版本”可以选择：

- `Spine 4.2 / PixiJS 8`：默认路径，适合 4.2 导出的资源；4.0 / 4.1 的 JSON 会在加载时自动转换成 4.2 格式（`transform` → `inherit`，`deform` → `attachments`），`.skel` 不做转换。
- `Spine 4.1 / PixiJS 6.5.10`：兼容路径，原生支持 4.0 和 4.1 导出的资源。

选择 skeleton 文件后会自动识别导出版本（JSON 读取 `skeleton.spine`，`.skel` 读取文件头），并自动切换到推荐的运行时，资源信息里会显示识别结果。仍可手动改回其他运行时；版本不一致时加载后会给出警告。Spine 3.x 资源暂不支持。

## 点击精度说明

- 最稳的做法：在 Spine 编辑器里给可点击部位加 **Bounding Box attachment**。
- 如果没有 Bounding Box，本项目会退回到对 region / mesh 的近似命中检测。

## 已知说明

- 当前右侧“调整”改的是 **bone**，不是 slot 本身。
- 一个 bone 可能控制多个 slot，所以修改后可能会一起变化。
- atlas 里的 page 名称若和上传图片文件名不一致，程序会尝试自动匹配；匹配不到时会退回首张图片。
