import { useLayoutEffect, useRef, type ReactNode } from 'react';

const modals: HTMLElement[] = [];
const originalInert = new Map<HTMLElement, boolean>();

function updateBackground() {
  for (const [element, inert] of originalInert) element.inert = inert;
  if (!modals.length) { originalInert.clear(); return; }
  const top = modals.at(-1)!;
  modals.forEach((modal, index) => { modal.style.zIndex = String(1000 + index); });
  for (const modal of modals) {
    for (const sibling of Array.from(modal.parentElement?.children ?? [])) {
      if (!(sibling instanceof HTMLElement)) continue;
      if (!originalInert.has(sibling)) originalInert.set(sibling, sibling.inert);
      sibling.inert = sibling !== top;
    }
  }
}

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false;
    for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  });
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement);
  const close = useRef(onClose);
  useLayoutEffect(() => { close.current = onClose; });
  useLayoutEffect(() => {
    const modal = ref.current!;
    const topmost = () => modals.at(-1) === modal;
    const focusFirst = () => (focusable(modal)[0] ?? modal).focus();
    modals.push(modal); updateBackground();
    if (!modal.contains(document.activeElement)) focusFirst();
    const keydown = (event: KeyboardEvent) => {
      if (!topmost()) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close.current();
      } else if (event.key === 'Tab') {
        const items = focusable(modal);
        const first = items[0], last = items.at(-1);
        const active = document.activeElement;
        if (!first) { event.preventDefault(); modal.focus(); }
        else if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
          event.preventDefault(); last!.focus();
        } else if (!event.shiftKey && (active === last || !items.includes(active as HTMLElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const focusin = (event: FocusEvent) => {
      if (topmost() && event.target instanceof Node && !modal.contains(event.target)) focusFirst();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      const wasTop = topmost();
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      modals.splice(modals.indexOf(modal), 1); updateBackground();
      const previous = previousFocus.current;
      if (wasTop && previous instanceof HTMLElement && previous.isConnected && !previous.closest('[inert]')) previous.focus();
    };
  }, []);
  return <div ref={ref} className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>{children}</div>;
}
