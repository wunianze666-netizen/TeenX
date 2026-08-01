import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type ToastState = {
  readonly id: number;
  readonly msg: string;
};

type ConfirmOptions = {
  readonly title?: string;
  readonly body?: string;
  readonly input?: boolean;
  readonly inputPlaceholder?: string;
  readonly inputValue?: string;
  readonly okText?: string;
  readonly cancelText?: string;
  readonly danger?: boolean;
};

type ConfirmResolver = {
  readonly options: ConfirmOptions;
  readonly resolve: (value: string | true | null) => void;
};

type FeedbackContextValue = {
  readonly toast: (msg: string) => void;
  readonly confirm: (options: ConfirmOptions) => Promise<string | true | null>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastState[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmResolver | null>(null);
  const [inputValue, setInputValue] = useState("");
  const sequenceRef = useRef(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const toast = useCallback((msg: string) => {
    const id = sequenceRef.current + 1;
    sequenceRef.current = id;
    setToasts((current) => [...current, { id, msg }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2_200);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInputValue(options.inputValue ?? "");
    return new Promise<string | true | null>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const closeConfirm = useCallback((value: string | true | null) => {
    if (!confirmState) return;
    confirmState.resolve(value);
    setConfirmState(null);
    window.queueMicrotask(() => triggerRef.current?.focus());
  }, [confirmState]);

  useEffect(() => {
    if (!confirmState) return;
    document.body.classList.add("feedback-modal-open");
    cancelRef.current?.focus();
    return () => document.body.classList.remove("feedback-modal-open");
  }, [confirmState]);

  function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirm(null);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="true" aria-relevant="additions">
        {toasts.map((item) => <div key={item.id} className="toast show">{item.msg}</div>)}
      </div>
      {confirmState && (
        <div className="modal-mask is-open" onClick={(event) => event.target === event.currentTarget && closeConfirm(null)}>
          <div
            ref={dialogRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={confirmState.options.body ? descriptionId : undefined}
            onKeyDown={trapDialogFocus}
          >
            <h3 id={titleId}>{confirmState.options.title ?? "确认操作"}</h3>
            {confirmState.options.body && <p id={descriptionId} className="muted small mt-0">{confirmState.options.body}</p>}
            {confirmState.options.input && (
              <div className="field modal-input-field">
                <input
                  className="input"
                  aria-label={confirmState.options.inputPlaceholder || "输入内容"}
                  placeholder={confirmState.options.inputPlaceholder ?? ""}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.currentTarget.value)}
                />
              </div>
            )}
            <div className="row modal-actions">
              <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={() => closeConfirm(null)}>
                {confirmState.options.cancelText ?? "取消"}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => closeConfirm(confirmState.options.input ? inputValue.trim() : true)}>
                {confirmState.options.okText ?? "确认"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback must be used within FeedbackProvider");
  return context;
}
