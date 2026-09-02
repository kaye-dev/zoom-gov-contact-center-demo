import type { ComponentPropsWithRef } from "react";

import { ChevronDownIcon } from "./svg/ChevronDownIcon";

export type SelectProps = Omit<
  ComponentPropsWithRef<"select">,
  "className" | "multiple" | "size" | "style"
> & {
  containerClassName?: string;
};

/**
 * Nativeの単一選択semanticsを維持しながら、closed controlの見た目を統一する。
 * 可視ラベルと補足・エラーは利用側で関連付ける。
 */
export function Select({
  containerClassName,
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
        className="peer block w-full cursor-pointer appearance-none rounded-md border border-line bg-surface px-3 py-2 pr-10 text-fg outline-none transition-colors focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 forced-colors:appearance-auto"
      />
      <span
        data-select-icon=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-muted peer-disabled:opacity-60 forced-colors:hidden"
      >
        <ChevronDownIcon height={20} width={20} />
      </span>
    </span>
  );
}
