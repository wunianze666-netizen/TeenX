export interface AdvxRoleTemplate {
  slug: string;
  name: string;
  description: string;
  responsibilities: string;
  defaultTools: string[];
  defaultSkills: string[];
  collaboration: {
    reportsTo: "inventor" | "captain" | null;
    canDelegateTo: string[];
  };
  icon: string;
}

export const ADVX_ROLE_TEMPLATES: AdvxRoleTemplate[] = [
  {
    slug: "scout",
    name: "侦察员",
    description: "查清事实、找约束，把问题的边界摸清楚。",
    responsibilities:
      "在队伍开始干活前，先去搜索、读资料，把任务相关的关键事实和限制条件整理出来，汇报给点子员。",
    defaultTools: ["search", "read-file"],
    defaultSkills: [],
    collaboration: { reportsTo: "inventor", canDelegateTo: [] },
    icon: "scout",
  },
  {
    slug: "inventor",
    name: "点子员",
    description: "出主意、想方案，把侦察员的资料变成可执行的点子。",
    responsibilities:
      "接收侦察员的资料，基于事实提出 2-3 个可行的方案或点子，把方案交给搭建员去实现。",
    defaultTools: ["search", "draw"],
    defaultSkills: [],
    collaboration: { reportsTo: null, canDelegateTo: ["builder"] },
    icon: "inventor",
  },
  {
    slug: "builder",
    name: "搭建员",
    description: "把方案做出来，产出队伍的最终产物。",
    responsibilities:
      "接收点子员委托的方案，把它做成实际的产物（文字、清单、代码、图等），交给挑刺员质检。",
    defaultTools: ["write-code", "draw", "write-doc"],
    defaultSkills: [],
    collaboration: { reportsTo: null, canDelegateTo: [] },
    icon: "builder",
  },
  {
    slug: "critic",
    name: "挑刺员",
    description: "挑毛病、质检，不能自己改产物，只能向队长汇报问题。",
    responsibilities:
      "检查搭建员的产物，找出问题、漏洞、可以改进的地方，写一份质检报告向队长汇报。不直接修改产物。",
    defaultTools: ["read-file", "run-tests"],
    defaultSkills: [],
    collaboration: { reportsTo: null, canDelegateTo: [] },
    icon: "critic",
  },
  {
    slug: "custom",
    name: "自定义",
    description: "从零开始定义一个角色。",
    responsibilities: "由队长自行定义这个角色要干什么。",
    defaultTools: [],
    defaultSkills: [],
    collaboration: { reportsTo: null, canDelegateTo: [] },
    icon: "custom",
  },
];

export const ADVX_STARTER_TEMPLATE_SLUGS = ["scout", "inventor", "builder", "critic"] as const;

export function getRoleTemplate(slug: string): AdvxRoleTemplate | null {
  return ADVX_ROLE_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

export interface AdvxTool {
  id: string;
  name: string;
  description: string;
  category: string;
}

export const ADVX_TOOLS: AdvxTool[] = [
  { id: "search", name: "搜索", description: "在网上搜索资料", category: "research" },
  { id: "read-file", name: "读文件", description: "读取工作区里的文件", category: "file" },
  { id: "write-file", name: "写文件", description: "在工侐区创建或修改文件", category: "file" },
  { id: "write-code", name: "写代码", description: "编写代码产物", category: "build" },
  { id: "draw", name: "画图", description: "生成图片或图表", category: "visual" },
  { id: "write-doc", name: "写文档", description: "撰写文字产物", category: "build" },
  { id: "run-tests", name: "跑测试", description: "执行测试检查产物质量", category: "verify" },
  { id: "browse", name: "浏览网页", description: "打开并浏览指定网页", category: "research" },
];

export interface AdvxTestTask {
  slug: string;
  title: string;
  description: string;
  prompt: string;
}

export const ADVX_TEST_TASKS: AdvxTestTask[] = [
  {
    slug: "hello-team",
    title: "自我介绍",
    description: "让队伍协作产出一段自我介绍文字。",
    prompt:
      "请你们队伍协作完成一次自我介绍：侦察员先查清楚队伍里每个角色是谁，点子员提出介绍的角度，搭建员把介绍写出来，挑刺员检查是否清楚易懂。最终产出一段 200 字以内的队伍自我介绍。",
  },
  {
    slug: "todo-maker",
    title: "做个待办清单",
    description: "让队伍做一个简单的待办清单文本。",
    prompt:
      `请你们队伍协作做一个"周末计划"的待办清单：侦察员找出周末可能要做的事，点子员提出 3 个候选清单，搭建员写最终清单，挑刺员检查是否遗漏。产出一份包含 5 条待办的清单。`,
  },
  {
    slug: "idea-sketch",
    title: "围绕主题出点子",
    description: "让队伍围绕一个给定主题产出 3 个点子。",
    prompt:
      `主题是"让校园更环保"。请你们队伍协作：侦察员查出校园里浪费资源的地方，点子员提出 3 个改进点子，搭建员把每个点子写成一句话方案，挑刺员指出每个点子的潜在问题。最终产出 3 个点子加挑刺意见。`,
  },
];
