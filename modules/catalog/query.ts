export function englishQuery(input: string) {
  const dictionary: Record<string, string> = {
    医学影像: "medical imaging",
    病历: "clinical notes",
    报告: "radiology report",
    智能体: "agent",
    多模态: "multimodal",
    诊断: "diagnosis",
    临床: "clinical",
    病理: "pathology",
    胸片: "chest x-ray",
    问答: "question answering",
  };
  let value = input.trim();
  for (const [zh, en] of Object.entries(dictionary))
    value = value.replaceAll(zh, ` ${en} `);
  return (
    value
      .replace(/[，。+、／/]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180) || "multimodal medical imaging clinical notes agent"
  );
}
