# SD freeze exec-entry dispatcher

> D3 P1-3 的核心新组件：冻结形态下的 spawn 契约。

## 契约（venv 现状 → 冻结目标）

| 调用方（Node） | venv 现状 spawn 目标 | 冻结后 spawn 目标 |
| --- | --- | --- |
| jiuwenswarm.mjs（agent 执行器） | `backend/jw/.venv/Scripts/python.exe -m jiuwenswarm.server…` | `backend/jw/sd-jw.exe jw …`（exec-entry 分发） |
| evolve 侧车 | `envs-template/sd-services/…/python.exe -m sciencediscovery_evolve…` | `backend/services/sd-services.exe evolve …` |
| paper_worker | `…/python.exe services/paper/paper_worker.py` | `backend/services/sd-services.exe paper …` |
| MCP servers（stdio） | 同上 | 同上 `… sd-services.exe mcp <name> …` |
| 候选程序（evolve 沙箱） | 同 venv `python -I`（本进程解释器） | `sd-services.exe candidate …`（-I 语义由冻结 bootloader 继承） |

## 分发器语义（单 exe 多入口，JW jiuwenswarm_exe_entry.py 同款）

```text
sd-<tree>.exe <entry> [args...]
  ├─ entry ∈ {jw, evolve, paper, mcp:<name>, candidate, gateway, …}
  ├─ argv[1:] 原样转发给对应 python 入口函数
  └─ 退出码/信号语义与 venv python -m 完全一致（Node 侧零感知改动）
```

## 迁移规则（jiuwenswarm.mjs 改造，768 行）

- venv 布局解析段（POSIX/win32 双分支）**整体退役**，换 `<payload>/backend/<tree>/sd-<tree>.exe`
- `-m <module>` 调用改 `<exe> <entry>`；MCP stdio 的 env 传递不变
- 幂等回退：`SD_FREEZE=0` 时走旧路径（P4 验证期双轨，P3-4 后删）
