import React from 'react';

interface Props {
  className?: string;
  size?: number | string;
}

export default function ExpertGpsLogo({ className = "w-full h-full", size }: Props) {
  return (
    <svg 
      viewBox="0 0 200 200" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      <defs>
        <linearGradient id="egps-dot" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00CFFF" />
          <stop offset="60%" stopColor="#0062FF" />
          <stop offset="100%" stopColor="#003ACC" />
        </linearGradient>
        <linearGradient id="egps-stem" x1="0%" y1="0%" x2="40%" y2="100%">
          <stop offset="0%" stopColor="#005BFF" />
          <stop offset="45%" stopColor="#0B1A48" />
          <stop offset="100%" stopColor="#060E28" />
        </linearGradient>
        <linearGradient id="egps-bar" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#004AD9" />
          <stop offset="40%" stopColor="#0080FF" />
          <stop offset="100%" stopColor="#00D0FF" />
        </linearGradient>
      </defs>

      {/* Dot for 'i' */}
      <circle cx="43" cy="36" r="18" fill="url(#egps-dot)" />

      {/* Stem of 'i' and bottom outer swoop */}
      <path d="M26 64 C26 62 27.5 60 29.5 60 H55.5 C57.5 60 59 62 59 64 V128 C59 146 72 163 98 163 C124 163 146 150 162 133 C160 156 136 178 102 178 C54 178 26 148 26 112 Z" fill="url(#egps-stem)" />

      {/* The letter 'e' main body (dark navy) */}
      <path d="M125 58 C88 58 60 84 60 120 C60 156 88 178 126 178 C158 178 182 160 190 138 H161 C154 148 141 154 126 154 C104 154 88 138 87 116 H193 C193 112 193 106 193 100 C193 76 164 58 125 58 Z M88 100 C91 84 105 76 125 76 C144 76 159 84 164 100 H88 Z" fill="#060E28" />

      {/* Cyan accent horizontal slice on 'e' */}
      <path d="M96 118 L108 102 H192 V118 Z" fill="url(#egps-bar)" />
    </svg>
  );
}
