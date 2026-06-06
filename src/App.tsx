import { useBrew } from "./hooks/useBrew";
import { AppLayout } from "./components/AppLayout";
import { InstallBrew } from "./components/InstallBrew";
import { SplashScreen } from "./components/SplashScreen";
import "./App.css";

function App() {
  const { status, loading, refresh } = useBrew();

  if (loading && !status) {
    return <SplashScreen message="Checking for Homebrew…" />;
  }

  const brewStatus = status ?? {
    installed: false,
    path: null,
    version: null,
  };

  if (!brewStatus.installed) {
    return (
      <div className="app-shell">
        <InstallBrew onRecheck={refresh} checking={loading} />
        <div className="browse-without-brew">
          <p className="section-label">Browse without Homebrew</p>
          <AppLayout brewStatus={brewStatus} />
        </div>
      </div>
    );
  }

  return <AppLayout brewStatus={brewStatus} />;
}

export default App;
