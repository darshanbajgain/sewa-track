'use client';

import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Accessible modal dialog, rendered with a PORTAL into <body>.
 *
 * Why a portal: the dialog is placed at the end of <body>, outside the page's layout, so no parent's
 * `overflow: hidden` or stacking order can clip or cover it.
 *
 * Behaviour (WAI-ARIA "dialog (modal)" pattern):
 *   - role="dialog" + aria-modal="true" + aria-labelledby (the title) + aria-describedby (optional)
 *   - on open: focus moves INTO the dialog (first focusable element, or the dialog itself)
 *   - Tab / Shift+Tab are TRAPPED inside (focus can't wander to the page behind)
 *   - Esc closes; a click on the dark backdrop closes; a click INSIDE the panel does not
 *   - on close: focus RETURNS to the element that opened it (keyboard users don't lose their place)
 *   - the page behind can't scroll while open
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}

export function Modal({ open, onClose, title, description, children, footer, closeLabel = 'Close' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(false);
  // useEffectEvent: always calls the LATEST onClose, without being an effect dependency. Parents usually
  // pass a new function on every render; if the effect re-ran each time, focus would jump back to the
  // first button while the user is typing.
  const close = useEffectEvent(() => onClose());

  // Portals need `document`, which doesn't exist during server rendering: render only after mount.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null; // remember who opened us

    const panel = panelRef.current!;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      // Focus trap: wrap from last → first (Tab) and first → last (Shift+Tab).
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus(); // give focus back to the button that opened the dialog
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      // Close only when the click started AND ended on the backdrop itself, not inside the panel.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-xl font-bold text-primary">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-2xl leading-none text-muted hover:bg-surface"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line p-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
