export type BackgroundTask = () => Promise<unknown>;
/** Transport and provider independent; each registered workflow owns its retry/lease policy. */
export function createTaskRunner(
  tasks: Readonly<Record<string, BackgroundTask>>,
) {
  return {
    names: Object.keys(tasks),
    async run(name: string): Promise<
      | {
          ok: true;
          result: unknown;
        }
      | {
          ok: false;
          error: string;
        }
    > {
      if (!Object.hasOwn(tasks, name))
        return { ok: false, error: "未知后台任务" };
      try {
        return { ok: true, result: await tasks[name]() };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "后台任务执行失败",
        };
      }
    },
  };
}
