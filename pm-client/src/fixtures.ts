import { dependencySchema } from "../../lib/schema";
import type { RecordItem, Snapshot } from "./domain";

export const DEMO_NOW = "2026-09-25T16:00:00.000Z";
function record(
  id: string,
  title: string,
  extra: Partial<RecordItem> = {},
): RecordItem {
  return {
    id,
    title,
    role: "ticket",
    status: "open",
    priority: 2,
    assignee: "codex",
    labels: ["界面"],
    description: "按验收标准完成实现，并附上验证结果。",
    acceptance:
      "- [x] 核心行为可以演示\n- [x] 已记录验证结果\n- [ ] 完成人工验收",
    dependencies: [],
    ...extra,
  };
}
export function createFixture(): Snapshot {
  const items: RecordItem[] = [
    record("demo-atlas", "工作空间更新", {
      role: "project",
      status: "in_progress",
      labels: ["产品"],
      description:
        "把分散的工作收进一个清楚、安静的地方。\n\n这轮先完成信息结构，再接入交互与验证。",
      due: "2026-10-02",
      plan: { start: "2026-09-21", end: "2026-10-01" },
      forecast: {
        start: "2026-10-01",
        end: "2026-10-03",
        reason: "人工估计，等待首轮验收后再校准。",
        updated: "2026-09-25",
      },
    }),
    record("demo-content", "结构与内容", {
      role: "milestone",
      parent: "demo-atlas",
      status: "in_progress",
      plan: { start: "2026-09-21", end: "2026-09-26" },
      due: "2026-09-26",
    }),
    record("demo-delivery", "联调与交付", {
      role: "milestone",
      parent: "demo-atlas",
      status: "open",
      plan: { start: "2026-09-27", end: "2026-10-01" },
      due: "2026-10-01",
    }),
    record("demo-later", "后续完善", {
      role: "milestone",
      parent: "demo-atlas",
      status: "idea",
      assignee: undefined,
    }),
    record("demo-a", "确认项目首页的信息层级", {
      parent: "demo-content",
      status: "in_progress",
      priority: 1,
      assignee: "reviewer",
      request: {
        kind: "review",
        reason: "首页已完成。需要你确认项目进度和下一步是否一眼可见。",
        evidence: "示例交付 v3 · 类型检查通过 · 6 项交互检查通过",
        revision: "demo-v3",
      },
      plan: { start: "2026-09-22", end: "2026-09-25" },
      due: "2026-09-25",
      description:
        "## 交付内容\n\n项目列表显示工单进度、待验收和阻塞项。项目可以包含里程碑，也可以直接关联工单。\n\n## 验证步骤\n\n1. 打开项目，展开「结构与内容」。\n2. 检查长标题与工单路径。\n3. 对照 Map 中的包含关系。",
    }),
    record("demo-b", "接入首页与详情之间的导航", {
      parent: "demo-delivery",
      priority: 1,
      dependencies: [
        dependencySchema.parse({ depends_on_id: "demo-a", type: "blocks" }),
      ],
      plan: { start: "2026-09-27", end: "2026-09-29" },
      due: "2026-09-30",
    }),
    record(
      "demo-c",
      "整理较长中文标题在不同窗口宽度下的阅读与换行，让上下文完整保留",
      {
        parent: "demo-content",
        status: "in_progress",
        plan: { start: "2026-09-23", end: "2026-09-26" },
        labels: ["界面", "排版"],
      },
    ),
    record("demo-d", "补充空状态与错误提示文案", {
      parent: "demo-content",
      status: "open",
      labels: ["文案"],
      plan: { start: "2026-09-25", end: "2026-09-26" },
    }),
    record("demo-e", "验证跨阶段依赖与关闭后的更新", {
      parent: "demo-delivery",
      dependencies: [
        dependencySchema.parse({ depends_on_id: "demo-c", type: "blocks" }),
        dependencySchema.parse({ depends_on_id: "demo-a", type: "blocks" }),
      ],
      plan: { start: "2026-09-29", end: "2026-10-01" },
    }),
    record("demo-f", "选择第一轮交付的范围", {
      parent: "demo-atlas",
      status: "blocked",
      assignee: "reviewer",
      labels: ["决策"],
      request: {
        kind: "decision",
        reason: "移动端适配是否进入下一轮？请在这张票留下范围决定。",
      },
      due: "2026-09-26",
    }),
    record("demo-g", "探索更轻的快捷操作入口", {
      parent: "demo-atlas",
      status: "idea",
      assignee: undefined,
    }),
    record("demo-h", "准备演示用的图标", {
      parent: "demo-delivery",
      status: "deferred",
      labels: ["设计"],
    }),
    record("demo-notes", "阅读与写作", {
      role: "project",
      status: "in_progress",
      labels: ["个人"],
      description: "将阅读笔记整理为文章。本项目直接管理工单。",
      due: "2026-10-04",
    }),
    record("demo-note-a", "整理本周阅读笔记", {
      parent: "demo-notes",
      status: "in_progress",
      plan: { start: "2026-09-24", end: "2026-09-27" },
      labels: ["写作"],
    }),
    record("demo-note-b", "检查文章初稿的论点与例子", {
      parent: "demo-notes",
      assignee: "reviewer",
      request: {
        kind: "review",
        reason: "初稿已写完，请检查例子是否真正支持论点。",
        evidence: "示例初稿 v1 · 结构已检查",
        revision: "demo-draft-v1",
      },
      due: "2026-09-28",
      labels: ["写作"],
    }),
    record("demo-empty", "下一轮的想法", {
      role: "project",
      status: "idea",
      assignee: undefined,
      labels: [],
      description: "范围待确认，尚未拆分工单。",
    }),
    record("demo-independent", "提供演示所需的示例素材", {
      status: "blocked",
      assignee: "reviewer",
      labels: ["素材"],
      request: {
        kind: "action",
        reason: "需要你选一组可公开使用的素材，才能完成演示内容。",
      },
      due: "2026-09-25",
    }),
    record("demo-idea", "试试每周只保留三个重点", {
      status: "idea",
      assignee: undefined,
      labels: ["个人"],
    }),
  ];
  for (let i = 0; i < 231; i++) {
    const hours = i < 25 ? i * 1.8 + 0.5 : 72 + (i - 25) * 9;
    items.push(
      record(
        `demo-done-${String(i + 1).padStart(3, "0")}`,
        [
          "统一列表的行间距",
          "补充导航的键盘焦点",
          "核对详情中的日期展示",
          "简化项目摘要文案",
        ][i % 4] + ` · ${i + 1}`,
        {
          parent:
            i < 8 ? "demo-notes" : i < 120 ? "demo-content" : "demo-delivery",
          status: "closed",
          closedAt: new Date(
            Date.parse(DEMO_NOW) - hours * 3600000,
          ).toISOString(),
          closure: "historical",
          labels: ["历史"],
          assignee: "codex",
          acceptance: undefined,
        },
      ),
    );
  }
  return {
    workspace: "example-workspace-v1",
    complete: true,
    now: DEMO_NOW,
    items,
    ready: new Set(["demo-d"]),
  };
}
