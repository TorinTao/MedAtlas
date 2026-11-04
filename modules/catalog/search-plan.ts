import type { Paper } from "../../shared/models";
export type SearchFocus = { searchQuery: string; conceptGroups: string[][] };
export type LiteraturePlan = {
  queries: string[];
  conceptGroups: string[][];
  description: string;
  memoryAgent?: boolean;
};
const normalized = (value: string) =>
  ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
const agents = [
  "agent",
  "agents",
  "agentic",
  "language model",
  "language models",
  "llm",
  "llms",
];
const medicine = [
  "medical",
  "medicine",
  "clinical",
  "healthcare",
  "health care",
  "biomedical",
  "patient",
  "patients",
  "ehr",
];
export function planLiteratureSearch(
  query: string,
  focus: SearchFocus,
): LiteraturePlan {
  const input = `${query} ${focus.searchQuery}`.toLowerCase();
  if (
    /memory|记忆|記憶/.test(input) &&
    /agent|智能体|language model|llm/.test(input) &&
    /医学|医疗|临床|medical|clinical|healthcare/.test(input)
  )
    return {
      queries: [
        "medical agent memory",
        "clinical language model memory",
        "healthcare agent episodic memory",
        "medical agent longitudinal context",
      ],
      conceptGroups: [
        medicine,
        agents,
        [
          "memory",
          "memories",
          "episodic",
          "long term memory",
          "persistent memory",
          "memory augmented",
          "longitudinal context",
          "patient history",
          "context management",
        ],
      ],
      memoryAgent: true,
      description:
        "覆盖医学智能体的长期记忆、情景记忆、患者历史和上下文管理；排除只有生物学记忆或通用硬件内存的结果。",
    };
  if (
    /影像|imaging|radiology/.test(input) &&
    /病历|临床文本|clinical notes|clinical text|electronic health/.test(input)
  )
    return {
      queries: [
        "medical imaging clinical text agent",
        "radiology report language model",
        "medical imaging electronic health records multimodal",
        "radiology agent report generation",
      ],
      conceptGroups: [
        [
          "medical imaging",
          "medical image",
          "medical images",
          "radiology",
          "radiological",
          "chest x ray",
          "cxr",
          "x ray",
          "pathology",
          "mri",
          "ct scan",
        ],
        [
          "clinical notes",
          "clinical text",
          "electronic health record",
          "electronic health records",
          "ehr",
          "medical record",
          "medical records",
          "report",
          "reports",
        ],
        [...agents, "multimodal", "vision language"],
      ],
      description:
        "覆盖医学影像、病历与报告文本及 Agent/多模态语言模型，纳入构建智能体可参考的基础模型工作。",
    };
  const groups = focus.conceptGroups.map((group) => [
    ...new Set(
      group.flatMap((term) => {
        const t = term.toLowerCase();
        if (/^(agent|agents|agentic)$/.test(t))
          return ["agent", "agents", "agentic"];
        if (/^(memory|memory management)$/.test(t))
          return [
            "memory",
            "episodic memory",
            "persistent memory",
            "memory augmented",
            "context management",
          ];
        return [term];
      }),
    ),
  ]);
  const queries = [
    focus.searchQuery,
    ...[0, 1, 2].map((i) =>
      groups.map((group) => group[i % group.length]).join(" "),
    ),
  ];
  return {
    queries: [...new Set(queries)].filter((q) => q.length >= 4).slice(0, 4),
    conceptGroups: groups,
    description: "按主题概念与常用同义表达进行多路外部检索。",
  };
}
export function matchesLiteraturePlan(
  paper: Paper,
  plan: LiteraturePlan,
): boolean {
  if (
    paper.abstract.trim().length < 100 ||
    paper.year < 2010 ||
    paper.year > new Date().getUTCFullYear()
  )
    return false;
  const text = normalized(`${paper.title} ${paper.abstract}`);
  if (
    !plan.conceptGroups.every((group) =>
      group.some((term) => text.includes(normalized(term))),
    )
  )
    return false;
  if (plan.memoryAgent) {
    const technology = [
      "language model",
      "language models",
      "llm",
      "llms",
      "artificial intelligence",
      "machine learning",
      "multi agent",
      "agentic",
      "autonomous agent",
      "conversational agent",
      "reinforcement learning",
      "digital agent",
    ].some((term) => text.includes(normalized(term)));
    if (!technology) return false;
    const computational = [
      "agent memory",
      "memory management",
      "memory augmented",
      "episodic memory",
      "persistent memory",
      "long term memory",
      "memory bank",
      "memory module",
      "memory retrieval",
      "memory mechanism",
      "memory system",
      "longitudinal context",
      "patient history",
      "context management",
    ].some((term) => text.includes(normalized(term)));
    const hardware =
      /\b(gpu|vram|cuda|memory footprint|memory consumption|memory bandwidth|memory efficient|memory efficiency)\b/.test(
        text,
      );
    const explicitAgent = ["agent", "agents", "agentic"].some((term) =>
      text.includes(normalized(term)),
    );
    if (!computational && (!explicitAgent || hardware)) return false;
  }
  return true;
}
