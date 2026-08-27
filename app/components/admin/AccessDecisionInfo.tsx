"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { InfoIcon } from "@/app/components/svg/InfoIcon";
import { useI18n } from "@/app/i18n/LanguageProvider";
import type {
  AdminAccessDecision,
  AdminAccessDecisionRoleReference,
} from "@/lib/admin-access/types";

import {
  getAdminRoleDisplayDescription,
  getAdminRoleDisplayName,
} from "./role-display";

type TooltipPosition = { top: number; left: number; ready: boolean };

export function AccessDecisionInfo({
  decision,
  resourceLabel,
  actionLabel,
}: {
  decision: AdminAccessDecision;
  resourceLabel: string;
  actionLabel: string;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    ready: false,
  });
  const isOpen = isHovered || isFocused || isPinned;

  const updatePosition = useCallback(() => {
    const buttonRect = buttonRef.current?.getBoundingClientRect();
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();
    if (!buttonRect || !tooltipRect) return;

    const margin = 12;
    const gap = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const height = Math.min(tooltipRect.height, window.innerHeight - margin * 2);
    const below = buttonRect.bottom + gap;
    const above = buttonRect.top - gap - height;
    const top =
      below + height <= window.innerHeight - margin
        ? below
        : Math.max(margin, above);
    const left = Math.max(
      margin,
      Math.min(
        buttonRect.right - width,
        window.innerWidth - width - margin,
      ),
    );
    setPosition({ top, left, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => {
      setPosition((current) => ({ ...current, ready: false }));
      updatePosition();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !tooltipRef.current?.contains(target)
      ) {
        setIsPinned(false);
        setIsHovered(false);
        setIsFocused(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsPinned(false);
      setIsHovered(false);
      setIsFocused(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, updatePosition]);

  const reason = getDecisionReason(decision, copy);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${resourceLabel} / ${actionLabel}: ${copy.infoLabel}`}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onClick={() =>
          setIsPinned((current) => {
            const next = !current;
            if (!next) {
              setIsHovered(false);
              setIsFocused(false);
            }
            return next;
          })
        }
        className="inline-flex cursor-pointer rounded-full p-1 text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <InfoIcon className="h-5 w-5" />
      </button>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              style={{
                top: position.top,
                left: position.left,
                width: "min(320px, calc(100vw - 24px))",
                visibility: position.ready ? "visible" : "hidden",
                maxHeight: "calc(100vh - 24px)",
              }}
              className="fixed z-[90] space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface-raised p-4 text-left text-sm text-fg shadow-xl"
            >
              <p className="font-semibold">
                {decision.allowed ? copy.allowed : copy.denied}
              </p>
              <p className="leading-5 text-fg-muted">{reason}</p>
              <RoleSources
                label={copy.allowSources}
                sources={decision.allowSources}
                empty={copy.noSources}
              />
              <RoleSources
                label={copy.denySources}
                sources={decision.denySources}
                empty={copy.noSources}
              />
              {decision.viewPrerequisite ? (
                <div className="border-t border-line pt-3">
                  <p className="font-semibold">{copy.actionLabels.VIEW}</p>
                  <div className="mt-2 space-y-2">
                    <RoleSources
                      label={copy.allowSources}
                      sources={decision.viewPrerequisite.allowSources}
                      empty={copy.noSources}
                    />
                    <RoleSources
                      label={copy.denySources}
                      sources={decision.viewPrerequisite.denySources}
                      empty={copy.noSources}
                    />
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type AccessControlCopy = ReturnType<typeof useI18n>["t"]["admin"]["accessControl"];

function getDecisionReason(
  decision: AdminAccessDecision,
  copy: AccessControlCopy,
) {
  switch (decision.reason) {
    case "EXPLICIT_DENY":
      return copy.explicitDeny;
    case "IMPLICIT_DENY":
      return copy.implicitDeny;
    case "VIEW_REQUIRED":
      return copy.viewRequired;
    case "ADMIN_USER_REQUIRED":
      return copy.adminRequired;
    case "ACCOUNT_SUSPENDED":
      return copy.accountSuspended;
    case "PASSWORD_CHANGE_REQUIRED":
      return copy.passwordChangeRequired;
    case "UNSUPPORTED":
      return copy.unsupportedReason;
    default:
      return decision.allowed ? copy.allowed : copy.denied;
  }
}

function RoleSources({
  label,
  sources,
  empty,
}: {
  label: string;
  sources: AdminAccessDecisionRoleReference[];
  empty: string;
}) {
  const { t } = useI18n();
  const copy = t.admin.accessControl;
  return (
    <div>
      <p className="font-semibold">{label}</p>
      {sources.length > 0 ? (
        <ul className="mt-1 space-y-1 text-fg-muted">
          {sources.map((source) => {
            const description = getAdminRoleDisplayDescription(source, copy);
            return (
              <li key={source.id}>
                <span className="font-medium text-fg">
                  {getAdminRoleDisplayName(source, copy)}
                </span>
                {description ? (
                  <span className="mt-0.5 block text-xs leading-5">{description}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-fg-muted">{empty}</p>
      )}
    </div>
  );
}
