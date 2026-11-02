/** Groups retain only owned handles still present in the current permitted projection. */
export function createControlGroups() {
  const groups: string[][] = Array.from({ length: 10 }, () => []);
  return {
    prune(allowed: ReadonlySet<string>) {
      for (let i = 0; i < groups.length; i++)
        groups[i] = groups[i]?.filter((id) => allowed.has(id)) ?? [];
    },
    set(index: number, selected: readonly string[], add = false) {
      if (!Number.isInteger(index) || index < 0 || index > 9) return;
      groups[index] = [...new Set([...(add ? (groups[index] ?? []) : []), ...selected])];
    },
    get: (index: number): string[] => [...(groups[index] ?? [])],
  };
}
