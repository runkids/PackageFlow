let openModalIds: string[] = [];
let scrollLockCount = 0;
let previousBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
  }
  scrollLockCount += 1;
  document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (scrollLockCount === 0) return;

  scrollLockCount -= 1;
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow ?? '';
    previousBodyOverflow = null;
  }
}

export function registerModal(modalId: string) {
  if (openModalIds.includes(modalId)) return;
  openModalIds = [...openModalIds, modalId];
  lockBodyScroll();
}

export function unregisterModal(modalId: string) {
  const idx = openModalIds.lastIndexOf(modalId);
  if (idx === -1) return;
  openModalIds = [...openModalIds.slice(0, idx), ...openModalIds.slice(idx + 1)];
  unlockBodyScroll();
}

export function isTopModal(modalId: string): boolean {
  return openModalIds[openModalIds.length - 1] === modalId;
}

