import React from 'react';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
  Filter,
  FeGaussianBlur,
  FeComposite,
  FeDropShadow,
} from 'react-native-svg';

interface ClassMarkerLogoProps {
  size?: number;
  transparent?: boolean;
}

export default function ClassMarkerLogo({ size = 48, transparent = false }: ClassMarkerLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Defs>
        <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#0F172A" />
          <Stop offset="100%" stopColor="#020617" />
        </LinearGradient>
        <LinearGradient id="gridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#06B6D4" stopOpacity="0.1" />
          <Stop offset="100%" stopColor="#00DDB3" stopOpacity="0.0" />
        </LinearGradient>
        <LinearGradient id="leftLegGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#3B82F6" />
          <Stop offset="100%" stopColor="#06B6D4" />
        </LinearGradient>
        <LinearGradient id="rightLegGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#06B6D4" />
          <Stop offset="100%" stopColor="#00DDB3" />
        </LinearGradient>
        <Filter id="foldShadow" x="-20%" y="-20%" width="140%" height="140%">
          <FeDropShadow dx="-2" dy="6" stdDeviation="4" floodColor="#000" floodOpacity="0.6" />
        </Filter>
        <Filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation="10" result="blur" />
          <FeComposite in="SourceGraphic" in2="blur" operator="over" />
        </Filter>
      </Defs>

      {/* Conditionally render the dark background box */}
      {!transparent && <Rect width="256" height="256" rx="60" fill="url(#bgGrad)" />}

      <Circle cx="128" cy="128" r="96" fill="none" stroke="url(#gridGrad)" strokeWidth="2" />
      <Circle cx="128" cy="128" r="64" fill="none" stroke="url(#gridGrad)" strokeWidth="1" strokeDasharray="4,6" />

      <Path
        d="M 56 180 L 92 108 L 140 172 L 200 76"
        fill="none"
        stroke="#00DDB3"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.15"
        filter="url(#glow)"
      />

      <Path
        d="M 56 180 L 92 108 L 128 156"
        fill="none"
        stroke="url(#leftLegGrad)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 104 124 L 140 172 L 200 76"
        fill="none"
        stroke="url(#rightLegGrad)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#foldShadow)"
      />

      <Circle cx="200" cy="76" r="6" fill="#FFFFFF" filter="url(#glow)" />
    </Svg>
  );
}
