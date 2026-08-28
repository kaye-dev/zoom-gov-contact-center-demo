"use client";

import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithRef,
} from "react";

export type CheckboxProps = Omit<
  ComponentPropsWithRef<"input">,
  "children" | "className" | "size" | "style" | "type"
> & {
  indeterminate?: boolean;
};

/**
 * 16pxの表示と24pxの操作領域を分離した共通チェックボックス。
 * ラベルは利用箇所の文脈に合わせて外部のlabelまたはaria-labelで指定する。
 */
export function Checkbox({
  disabled,
  indeterminate = false,
  onChange,
  ref,
  ...inputProps
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => inputRef.current!, []);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <span
      data-checkbox-root=""
      className="relative inline-grid h-6 w-6 shrink-0 place-items-center align-middle"
    >
      <input
        {...inputProps}
        ref={inputRef}
        data-checkbox-target=""
        type="checkbox"
        disabled={disabled}
        onChange={(event) => {
          event.currentTarget.indeterminate = indeterminate;
          onChange?.(event);
        }}
        className="peer absolute inset-0 z-10 m-0 h-6 w-6 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed forced-colors:appearance-auto forced-colors:opacity-100"
      />
      <span
        data-checkbox-indicator=""
        aria-hidden="true"
        className={[
          "pointer-events-none flex h-4 w-4 items-center justify-center rounded-[4px] border border-fg-muted bg-surface text-transparent transition-colors",
          "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-surface peer-indeterminate:border-accent peer-indeterminate:bg-accent peer-indeterminate:text-surface",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
          "peer-disabled:opacity-60 forced-colors:hidden",
          indeterminate ? "border-accent bg-accent text-surface" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {indeterminate ? (
          <span className="h-0.5 w-2 rounded-full bg-current" />
        ) : (
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            focusable="false"
          >
            <path
              d="m2 6 2.5 2.5L10 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
}
