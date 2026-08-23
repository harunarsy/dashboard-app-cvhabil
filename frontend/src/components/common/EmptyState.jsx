import React from "react";
import { UI_MOTION, uiTransition } from "../../constants/ui";

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const frameStyle = (compact) => ({
  width: compact ? "96px" : "140px",
  height: compact ? "96px" : "140px",
  margin: "0 auto",
  display: "grid",
  placeItems: "center",
  borderRadius: "28px",
  background:
    "radial-gradient(circle at top left, var(--color-selection) 0%, transparent 65%)",
  color: "var(--color-action)",
});

const svgProps = (compact) => ({
  viewBox: "0 0 140 140",
  width: compact ? 96 : 140,
  height: compact ? 96 : 140,
  "aria-hidden": true,
  focusable: false,
});

const BoxIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <rect x="28" y="40" width="84" height="58" rx="14" {...iconStroke} />
    <path d="M38 55l32-16 32 16-32 16-32-16Z" {...iconStroke} />
    <path d="M70 71v27" {...iconStroke} />
    <path d="M40 54l30 15 30-15" {...iconStroke} />
  </svg>
);

const InvoiceIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <path d="M40 24h44l16 16v72H40a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z" {...iconStroke} />
    <path d="M84 24v16h16" {...iconStroke} />
    <path d="M52 60h36" {...iconStroke} />
    <path d="M52 74h36" {...iconStroke} />
    <path d="M52 88h24" {...iconStroke} />
  </svg>
);

const CartIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <circle cx="54" cy="95" r="6" {...iconStroke} />
    <circle cx="90" cy="95" r="6" {...iconStroke} />
    <path d="M30 34h14l8 44h42l10-28H49" {...iconStroke} />
    <path d="M50 52h43" {...iconStroke} />
    <path d="M57 52l2 14h31" {...iconStroke} />
  </svg>
);

const ReceiptIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <path d="M42 24h56v86l-8-6-8 6-8-6-8 6-8-6-8 6V24Z" {...iconStroke} />
    <path d="M52 44h36" {...iconStroke} />
    <path d="M52 58h28" {...iconStroke} />
    <path d="M52 72h20" {...iconStroke} />
  </svg>
);

const UsersIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <circle cx="54" cy="54" r="14" {...iconStroke} />
    <path d="M30 96c0-13 11-24 24-24s24 11 24 24" {...iconStroke} />
    <circle cx="94" cy="58" r="10" {...iconStroke} />
    <path d="M78 96c0-9 7-16 16-16s16 7 16 16" {...iconStroke} />
  </svg>
);

const ChecklistIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <rect x="34" y="24" width="72" height="92" rx="16" {...iconStroke} />
    <path d="M50 48l6 6 10-12" {...iconStroke} />
    <path d="M50 70l6 6 10-12" {...iconStroke} />
    <path d="M50 92l6 6 10-12" {...iconStroke} />
    <path d="M70 48h18" {...iconStroke} />
    <path d="M70 70h18" {...iconStroke} />
    <path d="M70 92h18" {...iconStroke} />
  </svg>
);

const ChartIcon = ({ compact }) => (
  <svg {...svgProps(compact)} style={{ color: "var(--color-action)" }}>
    <path d="M28 102h84" {...iconStroke} />
    <path d="M38 92V58" {...iconStroke} />
    <path d="M58 92V46" {...iconStroke} />
    <path d="M78 92V64" {...iconStroke} />
    <path d="M98 92V38" {...iconStroke} />
    <path d="M32 86l18-14 16 8 18-22 14 8" {...iconStroke} />
    <circle cx="50" cy="72" r="3.5" fill="var(--color-selection)" />
    <circle cx="66" cy="80" r="3.5" fill="var(--color-selection)" />
    <circle cx="84" cy="58" r="3.5" fill="var(--color-selection)" />
    <circle cx="98" cy="66" r="3.5" fill="var(--color-selection)" />
  </svg>
);

export const EmptyStateIcons = {
  box: BoxIcon,
  invoice: InvoiceIcon,
  cart: CartIcon,
  receipt: ReceiptIcon,
  users: UsersIcon,
  checklist: ChecklistIcon,
  chart: ChartIcon,
};

export default function EmptyState({
  icon: Icon = ChartIcon,
  title,
  description,
  action,
  compact = false,
  className = "",
  style = {},
}) {
  return (
    <div
      className={`ui-empty-shell ${className}`.trim()}
      style={{
        padding: compact ? "1.5rem 1rem" : "2rem 1.25rem",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? "10px" : "14px",
        transition: uiTransition(
          "transform",
          UI_MOTION.duration.base,
          UI_MOTION.easing.enter,
        ),
        ...style,
      }}
    >
      <div style={frameStyle(compact)}>
        <Icon compact={compact} />
      </div>
      <div style={{ maxWidth: compact ? "320px" : "420px" }}>
        <h3
          style={{
            margin: 0,
            fontSize: compact ? "16px" : "18px",
            fontWeight: 800,
            color: "var(--color-text)",
            lineHeight: 1.25,
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: compact ? "12px" : "13px",
              lineHeight: 1.5,
              color: "var(--color-text-subtle)",
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ marginTop: compact ? "2px" : "4px" }}>{action}</div>}
    </div>
  );
}
