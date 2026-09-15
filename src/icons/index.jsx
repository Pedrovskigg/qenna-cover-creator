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

export const IconUndo = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M7 7H4V4" />
    <path d="M4 7a8 8 0 1 1-1.5 6.5" />
  </IconBase>
);

export const IconRedo = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M17 7h3V4" />
    <path d="M20 7a8 8 0 1 0 1.5 6.5" />
  </IconBase>
);

export const IconCopy = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="8" y="8" width="12" height="12" rx="1.5" />
    <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
  </IconBase>
);

export const IconLayersOrder = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 3l8 4.5-8 4.5-8-4.5z" strokeLinejoin="round" />
    <path d="M4 12l8 4.5 8-4.5" strokeLinejoin="round" />
    <path d="M4 16.5l8 4.5 8-4.5" strokeLinejoin="round" />
  </IconBase>
);

export const IconTextVertical = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M6 4h6" />
    <path d="M9 4v7" />
    <path d="M6 14h6" />
    <path d="M9 14v6" />
    <path d="M17 5v14" />
    <path d="M14.5 16.5L17 19l2.5-2.5" />
  </IconBase>
);

export const IconTextHorizontal = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M4 6h7" />
    <path d="M7.5 6v8" />
    <path d="M5 18h14" />
    <path d="M16.5 15.5L19 18l-2.5 2.5" />
  </IconBase>
);

export const IconOverlay = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M4 13h16" strokeOpacity="0.45" />
    <path d="M4 16.5h16" strokeOpacity="0.7" />
    <path d="M5 19.5h14" />
  </IconBase>
);

export const IconEyedropper = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M14.5 5.5l4 4" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3l-2 2-3-3z" />
    <path d="M15 8l-8.5 8.5L5 20l3.5-1.5L17 10" />
  </IconBase>
);

export const IconThumbnail = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="3" y="4" width="11" height="16" rx="1.5" />
    <rect x="16.5" y="13" width="4.5" height="7" rx="1" />
  </IconBase>
);

export const IconWarning = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.3" r="0.6" fill="currentColor" />
  </IconBase>
);

export const IconEye = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </IconBase>
);

export const IconEyeOff = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.3" />
    <path d="M6.3 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1" />
    <path d="M3 3l18 18" />
  </IconBase>
);

export const IconLock = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="5" y="11" width="14" height="9.5" rx="1.8" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </IconBase>
);

export const IconUnlock = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="5" y="11" width="14" height="9.5" rx="1.8" />
    <path d="M8 11V8a4 4 0 0 1 7.6-1.7" />
  </IconBase>
);

export const IconFlip = ({ size = 16 }) => (
  <IconBase size={size}>
    <path d="M12 3v18" strokeDasharray="2 2" />
    <path d="M9 7L4 17h5z" />
    <path d="M15 7l5 10h-5z" />
  </IconBase>
);

export const IconTemplates = ({ size = 16 }) => (
  <IconBase size={size}>
    <rect x="3.5" y="3.5" width="7" height="10" rx="1.2" />
    <rect x="13.5" y="3.5" width="7" height="6" rx="1.2" />
    <rect x="13.5" y="12.5" width="7" height="8" rx="1.2" />
    <rect x="3.5" y="16.5" width="7" height="4" rx="1.2" />
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
