import { DEFAULT_SPLASH_MESSAGE } from "../../constants/messages";
import "./SplashScreen.css";

interface SplashScreenProps {
  message?: string;
}

export function SplashScreen({ message = DEFAULT_SPLASH_MESSAGE }: SplashScreenProps) {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          className="splash-logo"
          aria-hidden="true"
        >
          <rect width="72" height="72" rx="18" fill="#534AB7" />
          <circle cx="36" cy="36" r="25" stroke="#CECBF6" strokeWidth="2" />
          <circle
            cx="36"
            cy="36"
            r="15"
            stroke="#7F77DD"
            strokeWidth="1.5"
            strokeDasharray="5.5 4"
          />
          <circle cx="36" cy="36" r="3.5" fill="#CECBF6" />
          <g className="splash-needle" style={{ transformOrigin: "36px 36px" }}>
            <line x1="36" y1="36" x2="36" y2="13" stroke="#CECBF6" strokeWidth="3" strokeLinecap="round" />
            <line x1="36" y1="36" x2="52" y2="46" stroke="#9490C4" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>

        <h1 className="splash-title">Brew Versionneer</h1>
        <p className="splash-tagline">Homebrew package browser</p>
        <p className="splash-message">{message}</p>
      </div>
    </div>
  );
}
