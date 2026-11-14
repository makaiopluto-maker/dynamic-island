export function Room() {
  return (
    <svg className="room-art" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4e4d2" />
          <stop offset="48%" stopColor="#e7d2bb" />
          <stop offset="100%" stopColor="#dcc6ae" />
        </linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9aa8c" />
          <stop offset="100%" stopColor="#a88362" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff8ee" />
          <stop offset="100%" stopColor="#f0c99a" />
        </linearGradient>
        <linearGradient id="sofa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffdfb" />
          <stop offset="100%" stopColor="#efe6dc" />
        </linearGradient>
        <radialGradient id="lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff1d6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff1d6" stopOpacity="0" />
        </radialGradient>
        <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>

      <rect width="1600" height="1000" fill="url(#wall)" />
      <rect x="0" y="0" width="1600" height="70" fill="#f7ebdd" />

      <rect x="610" y="48" width="300" height="640" rx="4" fill="#cbb69a" />
      <rect x="636" y="86" width="248" height="560" fill="#bba88a" />
      <rect x="674" y="150" width="170" height="120" fill="#cfc0a6" opacity="0.7" />
      <rect x="700" y="300" width="120" height="90" fill="#d8c6aa" opacity="0.55" />

      <g>
        <rect x="168" y="168" width="230" height="156" rx="3" fill="#f6eee4" />
        <rect x="184" y="184" width="198" height="124" fill="#e7b48c" />
        <path d="M184 230h198M250 184v124" stroke="#f3d7b8" strokeWidth="10" opacity="0.55" />
      </g>

      <g>
        <rect x="1210" y="78" width="270" height="520" rx="6" fill="#f8f1e8" />
        <rect x="1228" y="98" width="234" height="482" fill="url(#glass)" />
        <path d="M1345 98v482M1228 300h234" stroke="#f3e6d6" strokeWidth="10" />
      </g>
      <ellipse cx="1340" cy="240" rx="300" ry="210" fill="#fff3e2" filter="url(#bloom)" />
      <ellipse cx="220" cy="620" rx="180" ry="120" fill="url(#lamp)" />

      <polygon points="0,735 1600,678 1600,1000 0,1000" fill="url(#floor)" />
      <rect x="0" y="724" width="1600" height="16" fill="#ead8c4" />
      <ellipse cx="790" cy="900" rx="480" ry="70" fill="#b99574" opacity="0.55" />

      <g>
        <ellipse cx="300" cy="860" rx="280" ry="36" fill="#000" opacity="0.08" />
        <rect x="40" y="700" width="520" height="150" rx="48" fill="url(#sofa)" />
        <rect x="70" y="652" width="220" height="110" rx="32" fill="#fffaf6" />
        <rect x="300" y="668" width="200" height="96" rx="28" fill="#f7f1ea" />
        <rect x="78" y="748" width="150" height="46" rx="18" fill="#f3ebe3" />
      </g>

      <g>
        <ellipse cx="1240" cy="880" rx="220" ry="28" fill="#000" opacity="0.08" />
        <rect x="1040" y="730" width="400" height="140" rx="46" fill="#f8f4ef" />
        <rect x="1080" y="688" width="160" height="96" rx="28" fill="#fffdfb" />
      </g>

      <g>
        <ellipse cx="760" cy="868" rx="150" ry="18" fill="#5c3a28" opacity="0.2" />
        <ellipse cx="760" cy="852" rx="132" ry="16" fill="#8a5536" />
        <rect x="690" y="838" width="70" height="10" rx="2" fill="#f4efe8" />
        <rect x="772" y="836" width="46" height="14" rx="2" fill="#d7c3a4" />
      </g>

      <g>
        <rect x="1148" y="560" width="12" height="150" rx="6" fill="#6d5340" />
        <ellipse cx="1154" cy="548" rx="34" ry="16" fill="#7d9274" />
        <ellipse cx="1130" cy="566" rx="26" ry="12" fill="#8ea484" />
        <ellipse cx="1178" cy="562" rx="24" ry="11" fill="#6f866c" />
        <ellipse cx="1152" cy="532" rx="18" ry="20" fill="#98aa86" />
        <ellipse cx="1168" cy="700" rx="28" ry="8" fill="#6d5340" opacity="0.35" />
      </g>

      <g>
        <rect x="250" y="430" width="8" height="210" rx="4" fill="#c2a888" />
        <path d="M254 470c40-10 54 24 18 40" fill="none" stroke="#e7d3b4" strokeWidth="10" />
        <ellipse cx="254" cy="430" rx="28" ry="14" fill="#f6e2b8" />
      </g>
    </svg>
  );
}
