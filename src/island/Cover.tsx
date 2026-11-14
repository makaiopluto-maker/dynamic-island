import type { CoverTheme } from "./types.ts";

export function Cover({ theme, className = "" }: { theme: CoverTheme; className?: string }) {
  return (
    <div className={`cover cover-${theme} ${className}`.trim()} aria-hidden="true">
      <span className="sun" />
      <svg className="hills" viewBox="0 0 600 220" preserveAspectRatio="none">
        <path
          className="hill-back"
          d="M0 148C80 136 120 86 196 102C274 118 304 62 376 74C458 88 478 38 546 58C572 68 590 80 600 74V220H0Z"
        />
        <path
          className="hill-front"
          d="M0 176C86 156 140 148 214 170C304 196 334 126 424 154C496 176 534 140 600 162V220H0Z"
        />
      </svg>
    </div>
  );
}
