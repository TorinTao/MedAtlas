import type { Paper, ResearchRole } from "../../shared/models";
export type SearchFocus = { searchQuery: string; conceptGroups: string[][] };
export type LiteratureRole = ResearchRole;
export type LiteraturePath = { query: string; role: LiteratureRole };
export type LiteraturePlan = {
  queries: string[];
  paths: LiteraturePath[];
  conceptGroups: string[][];
  description: string;
  profile: "memory" | "image-text" | "generic";
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
        "clinical decision support patient history review",
        "clinical language models longitudinal records survey",
        "medical language agents electronic health records",
        "agent episodic memory retrieval",
        "long term memory augmented agents",
      ],
      paths: [
        ...[
          "medical agent memory",
          "clinical language model memory",
          "healthcare agent episodic memory",
          "medical agent longitudinal context",
        ].map((query) => ({ query, role: "核心研究" as const })),
        ...[
          "clinical decision support patient history review",
          "clinical language models longitudinal records survey",
        ].map((query) => ({ query, role: "历史脉络" as const })),
        {
          query: "medical language agents electronic health records",
          role: "邻近研究",
        },
        ...[
          "agent episodic memory retrieval",
          "long term memory augmented agents",
        ].map((query) => ({ query, role: "跨领域启发" as const })),
      ],
      profile: "memory",
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
        "先检索医学智能体记忆研究，再扩展到临床决策历史、邻近工作与通用 Agent 记忆方法；排除生物学记忆和硬件内存。",
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
        "radiology report generation history review",
        "medical vision language model survey",
        "clinical notes multimodal reasoning",
        "medical imaging agent clinical workflow",
        "multimodal agent image text reasoning",
      ],
      paths: [
        ...[
          "medical imaging clinical text agent",
          "radiology report language model",
          "medical imaging electronic health records multimodal",
          "radiology agent report generation",
        ].map((query) => ({ query, role: "核心研究" as const })),
        ...[
          "radiology report generation history review",
          "medical vision language model survey",
        ].map((query) => ({ query, role: "历史脉络" as const })),
        ...[
          "clinical notes multimodal reasoning",
          "medical imaging agent clinical workflow",
        ].map((query) => ({ query, role: "邻近研究" as const })),
        { query: "multimodal agent image text reasoning", role: "跨领域启发" },
      ],
      profile: "image-text",
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
        "检索影像与临床文本的直接工作，并补充报告生成脉络、邻近医学任务和可迁移的多模态方法。",
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
  const direct = [...new Set(queries)].filter((q) => q.length >= 4).slice(0, 4);
  const first = groups[0]?.[0] || "medical AI";
  const second = groups[1]?.[0] || "agent";
  const third = groups[2]?.[0] || "language model";
  const paths: LiteraturePath[] = [
    ...direct.map((query) => ({ query, role: "核心研究" as const })),
    { query: `${first} ${second} review survey`, role: "历史脉络" },
    { query: `${first} ${third} historical development`, role: "历史脉络" },
    { query: `${first} ${second} related methods`, role: "邻近研究" },
    { query: `${second} ${third} agent reasoning`, role: "跨领域启发" },
  ];
  return {
    queries: paths.map((path) => path.query),
    paths,
    profile: "generic",
    conceptGroups: groups,
    description: "外部多路检索核心研究、发展脉络、邻近工作与可迁移的方法。",
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
    if (
      /\b(without|no|lacks?|does not use)\s+(?:a\s+)?(?:persistent|episodic|long term)?\s*memory\b/.test(
        text,
      )
    )
      return false;
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

/** Assign one transparent relationship; generic method papers never become clinical evidence. */
export function classifyLiteraturePaper(
  paper: Paper,
  plan: LiteraturePlan,
): LiteratureRole | null {
  if (
    paper.abstract.trim().length < 100 ||
    paper.year < 2010 ||
    paper.year > new Date().getUTCFullYear()
  )
    return null;
  if (matchesLiteraturePlan(paper, plan)) return "核心研究";
  const text = normalized(`${paper.title} ${paper.abstract}`);
  const groups = plan.conceptGroups.map((group) =>
    group.some((term) => text.includes(normalized(term))),
  );
  const review =
    paper.paperType === "综述" ||
    /\b(review|survey|systematic|history|historical|evolution|progress|perspective)\b/.test(
      text,
    );
  const old = paper.year <= 2020;
  const medical =
    medicine.some((term) => text.includes(normalized(term))) ||
    /\b(radiology|radiological|chest x ray|cxr|pathology|clinical decision support)\b/.test(
      text,
    );
  if (plan.profile === "memory") {
    const computational =
      /\b(memory management|memory augmented|persistent memory|episodic memory|long term memory|memory retrieval|memory module|memory bank|context management|longitudinal context|patient history)\b/.test(
        text,
      );
    const technology =
      /\b(language model|llm|artificial intelligence|machine learning|agentic|autonomous agent|digital agent|clinical decision support)\b/.test(
        text,
      );
    const hardware =
      /\b(gpu|vram|cuda|memory footprint|memory consumption|memory bandwidth|memory efficient|memory efficiency)\b/.test(
        text,
      );
    if (!technology || (hardware && !computational)) return null;
    if (
      medical &&
      (groups[1] ||
        computational ||
        text.includes(" clinical decision support ")) &&
      (review || old)
    )
      return "历史脉络";
    if (medical && (groups[1] || computational)) return "邻近研究";
    if (!medical && groups[1] && computational) return "跨领域启发";
    return null;
  }
  if (plan.profile === "image-text") {
    if (medical && groups[0] && (groups[1] || groups[2]) && (review || old))
      return "历史脉络";
    if (
      medical &&
      ((groups[0] && groups[2]) ||
        (groups[1] && groups[2]) ||
        (groups[0] && groups[1]))
    )
      return "邻近研究";
    if (
      !medical &&
      groups[2] &&
      /\b(vision language|multimodal|image text)\b/.test(text) &&
      /\b(agent|reasoning|retrieval)\b/.test(text)
    )
      return "跨领域启发";
    return null;
  }
  const hits = groups.filter(Boolean).length;
  if (medical && hits >= 2 && (review || old)) return "历史脉络";
  if (medical && hits >= 2) return "邻近研究";
  if (
    !medical &&
    hits >= 2 &&
    /\b(agent|reasoning|retrieval|multimodal)\b/.test(text)
  )
    return "跨领域启发";
  return null;
}
