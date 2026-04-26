// Generic bottom-sheet picker — overlay + side panel matching the dealing
// detail panel style. Used by every Performance criteria knob.

import { useEffect } from "react";

export interface CriteriaOption<T extends string> {
  tag: T;
  label: string;
  description?: string;
}

interface Props<T extends string> {
  open: boolean;
  title: string;
  options: CriteriaOption<T>[];
  selection: T;
  onSelect: (tag: T) => void;
  onClose: () => void;
}

export function CriteriaSheet<T extends string>({
  open,
  title,
  options,
  selection,
  onSelect,
  onClose,
}: Props<T>) {
  // Close on Escape — matches the rest of the app's panel UX.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        aria-modal
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-background border-l border-black/10 dark:border-white/10 z-50 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-separator px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-surface/60"
            type="button"
            onClick={onClose}
          >
            <svg fill="none" height="18" viewBox="0 0 24 24" width="18">
              <path
                d="M6 6l12 12M6 18L18 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <ul className="divide-y divide-separator/60">
          {options.map((opt) => {
            const active = opt.tag === selection;

            return (
              <li key={opt.tag}>
                <button
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface/60"
                  type="button"
                  onClick={() => {
                    onSelect(opt.tag);
                    onClose();
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium">{opt.label}</div>
                    {opt.description != null && (
                      <div className="text-sm text-muted mt-0.5">
                        {opt.description}
                      </div>
                    )}
                  </div>
                  <svg
                    aria-hidden
                    className={active ? "text-[#6b5038]" : "text-transparent"}
                    fill="none"
                    height="18"
                    viewBox="0 0 24 24"
                    width="18"
                  >
                    <path
                      d="M5 12l5 5L20 7"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
