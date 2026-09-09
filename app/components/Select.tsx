import type { ComponentPropsWithRef } from "react";

import { ChevronDownIcon } from "./svg/ChevronDownIcon";

export type SelectProps = Omit<
  ComponentPropsWithRef<"select">,
  "className" | "multiple" | "size" | "style"
> & {
  containerClassName?: string;
  /** Closed-control text that can wrap; keep it in sync with the native value. */
  displayValue?: string;
};

/**
 * Nativeの単一選択semanticsを維持しながら、closed controlの見た目を統一する。
 * 可視ラベルと補足・エラーは利用側で関連付ける。
 */
export function Select({
  containerClassName,
  displayValue,
  disabled,
  ...selectProps
}: SelectProps) {
  return (
    <span
      data-select-root=""
      className={["relative block w-full", containerClassName]
        .filter(Boolean)
        .join(" ")}
    >
      <select
        {...selectProps}
        data-select-target=""
        disabled={disabled}
        className={[
          "peer block w-full cursor-pointer appearance-none rounded-md border border-line bg-surface px-3 py-2 pr-10 outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 forced-colors:appearance-auto",
          displayValue === undefined ? "text-fg" : "absolute inset-0 h-full text-transparent [&>option]:text-fg forced-colors:opacity-0",
        ].join(" ")}
      />
      {displayValue !== undefined && (
        <span
          data-select-value=""
          aria-hidden="true"
          className="pointer-events-none relative block min-h-[42px] whitespace-normal break-words rounded-md border border-transparent px-3 py-2 pr-10 text-fg peer-disabled:opacity-60 forced-colors:border-[ButtonText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText] forced-colors:peer-focus-visible:outline-2 forced-colors:peer-focus-visible:outline-offset-2 forced-colors:peer-focus-visible:outline-[Highlight]"
        >
          {displayValue}
        </span>
      )}
      <span
        data-select-icon=""
        aria-hidden="true"
        className={["pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted peer-disabled:opacity-60", displayValue === undefined ? "forced-colors:hidden" : ""].join(" ")}
      >
        <ChevronDownIcon height={20} width={20} />
      </span>
    </span>
  );
}
