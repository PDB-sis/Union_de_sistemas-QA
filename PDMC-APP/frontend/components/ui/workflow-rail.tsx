"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@shared/utils";

export type WorkflowStep<T extends string> = {
  id: T;
  label: string;
  description: string;
  count?: number;
  icon: LucideIcon;
  disabled?: boolean;
};

export function WorkflowRail<T extends string>({
  eyebrow = "Flujo de trabajo",
  title,
  description,
  steps,
  active,
  onChange,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  steps: readonly WorkflowStep<T>[];
  active: T;
  onChange: (step: T) => void;
}) {
  return (
    <section className="workflow-panel" aria-label={title}>
      <div className="workflow-heading">
        <div>
          <p className="workflow-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>
      <div className="workflow-rail" data-steps={steps.length}>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const selected = step.id === active;
          return (
            <div className="workflow-node" key={step.id}>
              <button type="button" aria-current={selected ? "step" : undefined} disabled={step.disabled} onClick={() => onChange(step.id)} className={cn("workflow-step", selected && "is-active")}>
                <span className="workflow-step-icon"><Icon /></span>
                <span className="min-w-0 flex-1">
                  <span className="workflow-step-label">{step.label}</span>
                  <span className="workflow-step-help">{step.description}</span>
                </span>
                {step.count !== undefined && <span className="workflow-step-count">{step.count.toLocaleString("es-VE")}</span>}
              </button>
              {index < steps.length - 1 && <ArrowRight className="workflow-arrow" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
