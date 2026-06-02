import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export default function OnboardingTour({
  active,
  currentStep,
  stepIndex,
  steps,
  onNext,
  onSkip,
}) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!active || !currentStep || typeof window === "undefined") return undefined;

    const update = () => {
      const target = document.querySelector(currentStep.selector);
      if (!target) {
        setRect(null);
        return;
      }
      const next = target.getBoundingClientRect();
      setRect({
        top: next.top,
        left: next.left,
        width: next.width,
        height: next.height,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, currentStep]);

  const cardStyle = useMemo(() => {
    const width = 320;
    const fallback = {
      top: 120,
      left: 24,
      width,
    };
    if (!rect || typeof window === "undefined") return fallback;
    const top =
      rect.top + rect.height + 16 < window.innerHeight - 220
        ? rect.top + rect.height + 16
        : rect.top - 220;
    return {
      width,
      top: clamp(top, 24, window.innerHeight - 220),
      left: clamp(rect.left, 16, window.innerWidth - width - 16),
    };
  }, [rect]);

  if (!active || !currentStep || typeof document === "undefined") return null;

  return createPortal(
    <div className="ui-onboarding-layer">
      <div className="ui-onboarding-dim" />
      {rect ? (
        <div
          className="ui-onboarding-spotlight"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      ) : null}
      <div className="ui-onboarding-card ui-motion-modal" style={cardStyle}>
        <div className="ui-onboarding-badge">
          <Sparkles size={16} />
          Langkah {stepIndex + 1}/{steps.length}
        </div>
        <h3>{currentStep.title}</h3>
        <p>{currentStep.body}</p>
        <div className="ui-onboarding-actions">
          <button type="button" className="ui-motion-button ui-focus-ring" onClick={onSkip}>
            Skip Tour
          </button>
          <button
            type="button"
            className="btn-primary ui-motion-button ui-focus-ring"
            data-magnetic="true"
            onClick={onNext}
          >
            {stepIndex >= steps.length - 1 ? "Selesai" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
