import React from "react";

export default function CcKnob({ value, min = 0, max = 100, step = 1, onChange, label, fmt, size = 44 }) {
  const clamp = (v) => Math.max(min, Math.min(max, Number(v) || 0));
  const val = clamp(value);
  const pct = max === min ? 0 : (val - min) / (max - min);
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;

  const pt = (deg) => {
    const rad = (deg - 90) * Math.PI / 180;
    return [+(cx + r * Math.cos(rad)).toFixed(2), +(cy + r * Math.sin(rad)).toFixed(2)];
  };
  const arc = (a1, a2) => {
    const [x1, y1] = pt(a1), [x2, y2] = pt(a2);
    return `M${x1} ${y1} A${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const fillAngle = -135 + pct * 270;
  const [dx, dy] = pt(fillAngle);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY, startVal = val, range = max - min;
    const onMove = (me) => {
      const raw = Math.max(min, Math.min(max, startVal + ((startY - me.clientY) / 110) * range));
      onChange(Number((Math.round(raw / step) * step).toFixed(10)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="ccKnob" onMouseDown={handleMouseDown} title={`${label}: ${fmt ? fmt(val) : val}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", overflow: "visible" }}>
        <path d={arc(-135, 135)} stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {pct > 0.003 && (
          <path d={arc(-135, fillAngle)} stroke="var(--ui-accent,#6ea8fe)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
        <circle cx={cx} cy={cy} r={r - 5} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        <circle cx={dx} cy={dy} r="2.8" fill="var(--ui-text,#eaeaea)" />
      </svg>
      <div className="ccKnobLabel">{fmt ? fmt(val) : val}</div>
      <div className="ccKnobLabel" style={{ color: "var(--ui-text,#eaeaea)", fontSize: 8, marginTop: 1 }}>{label}</div>
    </div>
  );
}
