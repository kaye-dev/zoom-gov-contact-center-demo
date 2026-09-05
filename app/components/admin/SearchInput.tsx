import { useId, type InputHTMLAttributes } from "react";

import { SearchIcon } from "@/app/components/svg/SearchIcon";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  containerClassName?: string;
};

export function SearchInput({
  id,
  label,
  className = "",
  containerClassName = "",
  ...props
}: SearchInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div
      data-search-input
      className={`relative min-w-0 ${containerClassName}`}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-muted" />
      <input
        {...props}
        id={inputId}
        type="search"
        className={`w-full rounded-md border border-line bg-surface py-2 pl-10 pr-3 text-fg transition-colors placeholder:text-fg-muted focus:border-accent focus:outline-none focus:ring-0 ${className}`}
      />
    </div>
  );
}
