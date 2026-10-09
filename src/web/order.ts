export function moveItem(ids: string[], id: string, targetId: string): string[] {
  const to = ids.indexOf(targetId);
  if (to < 0 || id === targetId || !ids.includes(id)) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}
