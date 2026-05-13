export function getBulkSlotVisibilityState(slots, hiddenSlots) {
  const total = slots.length;
  const shown = slots.filter((slot) => !hiddenSlots.has(slot.data.name)).length;

  if (total > 0 && shown === total) {
    return {
      checked: true,
      indeterminate: false,
      label: '全部显示',
    };
  }

  if (shown > 0) {
    return {
      checked: false,
      indeterminate: true,
      label: '部分显示',
    };
  }

  return {
    checked: false,
    indeterminate: false,
    label: '全部隐藏',
  };
}

export function applyBulkSlotVisibility(slots, hiddenSlots, visible) {
  for (const slot of slots) {
    const slotName = slot.data.name;
    if (visible) {
      hiddenSlots.delete(slotName);
    } else {
      hiddenSlots.add(slotName);
    }
  }
}
