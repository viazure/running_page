# Running Page · viazure

个人跑步主页：**[run.viazure.cc](https://run.viazure.cc)**

本仓库 fork 自 [yihong0618/running_page](https://github.com/yihong0618/running_page)。数据同步（Garmin / Keep / Strava / Nike 等）、部署（GitHub Pages / Vercel）、GitHub Actions 配置等通用用法，请直接看 [上游 README](https://github.com/yihong0618/running_page#readme)，这里只记录本 fork 的改动。

## 本 fork 的主要改动

### 1. `dashboard_pro` 主题

自包含的新主题（`src/themes/dashboard_pro`），不影响上游原有主题：

- 仪表盘式首页：个人资料卡、统计卡片、贡献热力图（动态色阶）、双日历视图、本月快览、个人最佳、活动日志与活动列表
- 地图：路线地图与轨迹页，路线自动适配视野、轨迹回放动画、3D 追随视角；无 GPS 的活动可复用上一条路线展示；轨迹墙与手机地图 FAB
- 汇总页五档浏览（年 / 月 / 周 / 日 / 生涯）：年档以「月度柱图 + 跨年累计」同卡呈现，月/周为周期对照卡，日为分页列表，生涯复用 Life 图
- 年档深度分析：训练负荷、强度分布、VO2max 与有氧解耦、最佳成绩与进展、训练习惯、Eddington 持续性；**缺数据的分析块自动隐藏**，不会留下空壳
- 首屏分层加载：活动列表走 lite payload，轨迹几何走 sidecar，深度分析走聚合 JSON（见下方「数据生成」）
- 横向 Chip 滚动（年份等）、中国地图、页眉页脚与中英文本地化
- 视觉与组件契约：[`docs/CURRENT-THEME-SPEC.md`](docs/CURRENT-THEME-SPEC.md)

`config.yml` 中 `dashboard_pro`（仅本主题生效；默认与当前外观一致）：

```yaml
dashboard_pro:
  show_latest: false # 首页 Latest 紧凑条（列表顶 1～3 条）
  modules:
    weekly: true # 本周目标
    yearly_goal: true # 年目标
    monthly_goal: true # 月目标
    streak: true # 连续
    heatmap: true # 贡献热力
    footprint: true # 足迹（中国地图）
    month_glance: true # 本月快览（右下角槽）
```

### 2. 每次活动的分段分析弹层

首页活动卡片上有分段数据的活动会出现入口，打开后显示：

- 摘要：距离、时间、配速、心率、步频、步幅、功率、爬升、训练效果等（副标题里带出有氧训练效果）
- 每公里配速条 + 分段表（按公里 / 按圈切换）
- 配速、心率、步频、步幅、功率、爬升（海拔剖面 + 爬升/下降 + 最高海拔）、跑步动态（触地时间、垂直振幅、垂直步幅比）等趋势图
- 心率区间（优先使用设备配置的区间，否则按最大心率估算）、配速区间（优先 FIT 速度区间，边界显示为 `5'00"` 而不是秒/公里数字；否则按阈值配速估算并标「估算」；按时长而不是采样点数）
- 仅在 FIT 含户外/天气温度时显示气温；手表传感器温度不展示（不标成「温度」也不标成「表温」）

数据源与可用字段：

| 来源                                         | 可显示                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| FIT（Garmin 等，`FIT_OUT/`）                 | 全部字段：分段、圈、步频、步幅、功率、跑步动态、设备心率区间、训练效果、负荷等 |
| GPX / TCX（如 Keep，`GPX_OUT/`、`TCX_OUT/`） | 每公里配速、心率、爬升、估算心率/配速区间；文件里有步频/功率时也会显示         |

同一活动同时有多种文件时优先级为 FIT > TCX > GPX；缺失的字段在弹层中直接隐藏。GPX/TCX 没有暂停事件，超过 30 秒且几乎没有移动的间隔按暂停处理。

### 3. 其他

- Garmin 中国区同步：导入 FIT 中的 GPS，修正开始时间解析等
- 隐私模式：关灯地图 + 匿名活动标题，可在 `config.yml` 开关；详见下方「隐私」

## 数据生成

站点读取三类文件，都由脚本生成，放在 `public/` 下：

> `.gitignore` 与上游保持一致，因此这三者**默认不会被忽略**。本机若用 Actions Cache 模式，`pnpm run setup:exclude` 会把它们加入本地排除（见下方「本地开发」）。

| 产物                                                                        | 生成命令            | 用途                                                        | 缺失时                              |
| --------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- | ----------------------------------- |
| `public/data/activities.lite.json`<br/>`public/data/activities.tracks.json` | `pnpm data:lite`    | 活动列表（无轨迹）+ 轨迹 sidecar，首屏不必下载 2MB 几何数据 | 回落读 `src/static/activities.json` |
| `public/splits/{run_id}.json`                                               | `pnpm data:splits`  | 每公里分段、区间、跑步动态、逐点曲线                        | 活动卡片不显示「分段分析」入口      |
| `public/summary/aggregates.json`                                            | `pnpm data:summary` | 训练负荷、VO2max、强度分布、最佳成绩等跨期聚合              | 深度分析卡片整体隐藏                |

`pnpm build` 与 `pnpm dev` 会自动串上 lite 与 summary 两步；summary 那步在**没有 Python 的机器上会跳过并给出警告**，不影响前端构建。

### 分段数据

```bash
pip install garmin-fit-sdk            # 仅解析 FIT 需要；GPX/TCX 用标准库
pnpm data:splits                      # 扫描 FIT_OUT、TCX_OUT、GPX_OUT，增量生成
python run_page/gen_splits.py --force # 全部重建
python run_page/gen_splits.py --fit-only
python run_page/gen_splits.py --file path/to/activity.fit  # 单个文件输出到终端
```

输出为 `public/splits/{run_id}.json` 和 `public/splits/index.json`。`run_id` 与 `src/static/activities.json` 对应：FIT 按开始时间（毫秒）；Keep 等以活动 id 命名的 GPX/TCX 按文件名，否则按开始时间。

### 深度分析聚合

```bash
pip install -r requirements.txt
pnpm data:summary                     # 读 src/static/activities.json + public/splits
```

输出 `public/summary/aggregates.json`（约 30KB）。**须在 `data:splits` 之后跑**，否则只有基础数据，依赖 stream 的分析块会全部隐藏。

### CI 中的顺序

`run_data_sync.yml` 同步数据后依次执行 `gen_splits.py` → `gen_summary.py`，并把 `public/splits`、`public/data`、`public/summary` 一并写入 Actions Cache；`gh-pages.yml` 从缓存还原后直接 `pnpm build`。**因此不需要把这三个目录提交进仓库。**

测试：`python -m pytest test_gen_splits.py` · `pnpm test`

## 本地开发

```bash
pnpm install
pnpm run setup:exclude   # 仅本机：把私密数据目录加入 .git/info/exclude
pnpm dev                 # 自动跑 lite + summary 生成，再起 Vite
```

### `.gitignore` 保持不变

`.gitignore` 与上游逐字节一致，**不在其中添加任何本 fork 专属规则**。

原因见 workflow 自己的注释：

```yaml
# Dual mode: false = commit FIT/GPX/TCX/splits via git add (do not gitignore them)
#            true  = Actions Cache only
```

git 模式靠 `git add .` 提交原始轨迹与生成的分段文件，全仓库 ignore 规则会让这些用户**静默地再也提交不上任何数据**。

本机若用 Actions Cache 模式，私人数据与生成物改用**本地排除**（`.git/info/exclude`，永不推送）：

- 规则模板：[`docs/local-exclude.txt`](docs/local-exclude.txt)
- 安装：`pnpm run setup:exclude`（幂等，可反复跑；块外你手写的规则会保留）

**没有执行这一步的 clone 行为与上游完全一致**，`git add .` 照常包含原始数据。

> 不建议 `git config core.excludesFile` 指向该模板：那是全局设置，会把这些规则套用到本机所有仓库。

## 隐私

### 隐私模式

公开站默认开启（`config.yml` 里 `privacy_mode: true`），避免把真实路线位置和活动名暴露给访客：

- **关灯地图**：关闭底图瓦片，只保留轨迹线（隐私开启时也不提供 3D）
- **匿名标题**（`privacy_anonymous_titles: true`）：活动名换成时段标题，如「清晨跑步」「傍晚跑步」「夜间跑步」；半马 / 全马、骑行等按距离与类型显示

永久关闭：`privacy_mode: false`（始终显示真实底图与原活动名）。只关灯、保留原标题可设 `privacy_anonymous_titles: false`。

### 分段与聚合数据

- 分段文件只含聚合后的统计和降采样曲线，**不含 GPS 坐标**，也没有逐秒原始数据
- 聚合文件（`aggregates.json`）是统计结果，同样不含坐标
- 两者都在本地或自己的 Actions 中生成，不上传到任何第三方
- 用 Actions Cache 模式时，`pnpm run setup:exclude` 已把它们加入本地排除，不会误提交

## License

沿用上游 [MIT License](LICENSE)。
