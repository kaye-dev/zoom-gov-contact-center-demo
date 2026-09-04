import Link from "next/link";

import { ChevronLeftIcon } from "@/app/components/svg/ChevronLeftIcon";
import { ChevronRightIcon } from "@/app/components/svg/ChevronRightIcon";

type PaginationProps = {
  page: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
  ariaLabel: string;
  previousLabel: string;
  nextLabel: string;
};

const edgeClassName =
  "inline-flex h-9 w-9 items-center justify-center border border-line bg-surface-raised text-fg transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Pagination({
  page,
  totalPages,
  previousHref,
  nextHref,
  ariaLabel,
  previousLabel,
  nextLabel,
}: PaginationProps) {
  return (
    <nav aria-label={ariaLabel} className="flex justify-center">
      <div className="inline-flex -space-x-px rounded-md shadow-sm" role="group">
        {page > 1 ? (
          <Link
            href={previousHref}
            aria-label={previousLabel}
            className={`${edgeClassName} rounded-l-md hover:bg-surface-hover`}
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={`${edgeClassName} rounded-l-md text-fg-muted opacity-50`}
          >
            <ChevronLeftIcon className="h-5 w-5" />
            <span className="sr-only">{previousLabel}</span>
          </span>
        )}
        <span
          aria-current="page"
          className="inline-flex h-9 items-center justify-center border-y border-line bg-surface-raised px-4 text-sm font-semibold text-fg"
        >
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={nextHref}
            aria-label={nextLabel}
            className={`${edgeClassName} rounded-r-md hover:bg-surface-hover`}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className={`${edgeClassName} rounded-r-md text-fg-muted opacity-50`}
          >
            <ChevronRightIcon className="h-5 w-5" />
            <span className="sr-only">{nextLabel}</span>
          </span>
        )}
      </div>
    </nav>
  );
}
