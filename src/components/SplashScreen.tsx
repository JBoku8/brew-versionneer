import "./SplashScreen.css";

interface SplashScreenProps {
  message?: string;
}

export function SplashScreen({ message = "Checking for Homebrew…" }: SplashScreenProps) {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-spinner" aria-hidden="true" />
        <h1 className="splash-title">Brew Versionneer</h1>
        <p className="splash-tagline">Homebrew package browser</p>
        <p className="splash-message">{message}</p>
      </div>
    </div>
  );
}
