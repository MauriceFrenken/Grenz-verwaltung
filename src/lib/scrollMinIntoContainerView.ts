/**
 * Scrollt `scrollParent` so, dass `element` sichtbar ist — ohne äußere Container mitzuscrollen.
 */
export function scrollMinIntoContainerView(
  element: HTMLElement,
  scrollParent: HTMLElement,
  pad = 12,
): void {
  const pRect = scrollParent.getBoundingClientRect();
  const eRect = element.getBoundingClientRect();
  const overTop = pRect.top - eRect.top + pad;
  const overBottom = eRect.bottom - pRect.bottom + pad;
  if (overTop > 0) {
    scrollParent.scrollTop -= overTop;
  } else if (overBottom > 0) {
    scrollParent.scrollTop += overBottom;
  }
}
