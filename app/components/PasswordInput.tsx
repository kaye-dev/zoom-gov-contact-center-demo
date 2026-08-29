"use client";

import {
  useId,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { useI18n } from "@/app/i18n/LanguageProvider";

import { VisibilityIcon } from "./svg/VisibilityIcon";
import { VisibilityOffIcon } from "./svg/VisibilityOffIcon";

export type PasswordInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type"
> & {
  label: ReactNode;
  containerClassName?: string;
};

export function PasswordInput({
  label,
  id,
  className,
  containerClassName,
  disabled,
  ...inputProps
}: PasswordInputProps) {
  const { t } = useI18n();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={["space-y-2", containerClassName].filter(Boolean).join(" ")}>
      <label htmlFor={inputId} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          id={inputId}
          type={isVisible ? "text" : "password"}
          disabled={disabled}
          className={[
            "w-full rounded-md border border-line bg-surface py-2 pl-3 pr-10 text-fg outline-none transition-colors focus:border-accent disabled:opacity-60",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        <button
          type="button"
          aria-label={isVisible ? t.auth.hidePassword : t.auth.showPassword}
          aria-pressed={isVisible}
          aria-controls={inputId}
          onClick={() => setIsVisible((visible) => !visible)}
          disabled={disabled}
          className="absolute inset-y-0 right-0 z-10 flex cursor-pointer items-center rounded-r-md px-3 text-fg-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isVisible ? (
            <VisibilityOffIcon height={14} width={14} />
          ) : (
            <VisibilityIcon height={14} width={14} />
          )}
        </button>
      </div>
    </div>
  );
}
