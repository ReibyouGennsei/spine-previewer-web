export function slotMatchesSearch(slot, query) {
  const keyword = String(query || '').trim().toLowerCase();
  if (!keyword) return true;

  const slotName = slot?.data?.name || '';
  const boneName = slot?.bone?.data?.name || '';
  return `${slotName} ${boneName}`.toLowerCase().includes(keyword);
}
