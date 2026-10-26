import type { ReactNode } from "react";

interface ViewStateProps {
  children: ReactNode;
  variant?: "default" | "error" | "empty";
}

export function ViewState({
  children,
  variant = "default",
}: ViewStateProps) {
  const variantClass =
    variant === "error"
      ? " is-error"
      : variant === "empty"
        ? " is-empty"
        : "";

  return (
    <div className={`nexo-view-state${variantClass}`}>
      {children}
    </div>
  );
}
