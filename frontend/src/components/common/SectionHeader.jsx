import React from "react";

export default function SectionHeader({ title, icon, description }) {
  return (
    <div className="ui-section-header">
      <div className="ui-section-header__title">
        {icon ? <span className="ui-section-header__icon">{icon}</span> : null}
        <span>{title}</span>
      </div>
      {description ? (
        <p className="ui-section-header__description">{description}</p>
      ) : null}
    </div>
  );
}
