import React from "react";

const IconBase = ({ size = 16, stroke = 1.6, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconX = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M6 6l12 12" />
    <path d="M18 6l-12 12" />
  </IconBase>
);

export const IconFilter = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M4 6h16" />
    <path d="M8 12h8" />
    <path d="M11 18h2" />
  </IconBase>
);

export const IconMaximize = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </IconBase>
);

export const IconDownload = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 3v10" />
    <path d="M8 10l4 4 4-4" />
    <path d="M5 21h14" />
  </IconBase>
);

export const IconBevel = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 3l7 4v4l-7 4-7-4V7z" strokeLinejoin="round" />
    <path d="M5 11v4l7 4 7-4v-4" strokeLinejoin="round" />
  </IconBase>
);

export const IconShadow = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3z" />
    <circle cx="12" cy="12" r="9" fill="none" />
    <path d="M12 3v18" strokeDasharray="2 2" opacity="0.4" />
    <path d="M12 3a9 9 0 0 1 0 18" fill="currentColor" opacity="0.9" />
  </IconBase>
);

export const IconGlow = ({ size = 16 }) => (
  <IconBase size={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" />
  </IconBase>
);

export const IconStroke = ({ size = 16 }) => (
  <IconBase size={size} stroke={3}>
    <circle cx="12" cy="12" r="6" fill="none" />
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
  </IconBase>
);

export const IconTransform = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 3a9 9 0 0 1 9 9" />
    <path d="M18 6l3-3-3-3" />
    <path d="M8 8h8v8H8z" />
  </IconBase>
);

export const IconBorderFrame = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" />
    <rect x="7" y="7" width="10" height="10" rx="1" fill="none" strokeOpacity="0.4" strokeWidth="1" />
  </IconBase>
);

export const IconSave = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M5 4h12l2 2v14H5z" />
    <path d="M7 4v6h8V4" />
    <path d="M8 18h8" />
  </IconBase>
);

export const IconTrash = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M4 7h16" />
    <rect x="6" y="7" width="12" height="13" rx="1.5" />
    <path d="M9 7v-2h6v2" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </IconBase>
);

export const IconImage = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M7 15l3-3 4 4 3-3 3 3" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
  </IconBase>
);

export const IconSparkle = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
    <path d="M19 15l0.8 2.2L22 18l-2.2 0.8L19 21l-0.8-2.2L16 18l2.2-0.8z" />
  </IconBase>
);

export const IconSettings = ({ size = 16 }) => (
  <IconBase size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.4" />
    <path d="M12 18.6V21" />
    <path d="M4.9 4.9l1.7 1.7" />
    <path d="M17.4 17.4l1.7 1.7" />
    <path d="M3 12h2.4" />
    <path d="M18.6 12H21" />
    <path d="M4.9 19.1l1.7-1.7" />
    <path d="M17.4 6.6l1.7-1.7" />
  </IconBase>
);
