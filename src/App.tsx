import { useBrew } from "./hooks/useBrew";
import { AppShell } from "./components/AppShell";
import { InstallBrew } from "./components/InstallBrew";
import "./App.css";

function App() {
  const { status, checking, refresh } = useBrew();

  const showInstallBrew = status !== null && !status.installed;

  if (showInstallBrew) {
    return (
      <div className="no-brew-shell">
        <InstallBrew onRecheck={refresh} checking={checking} />
        <div className="browse-without-brew">
          <p className="section-label">Browse without Homebrew</p>
          <AppShell brewStatus={status} brewChecking={checking} />
        </div>
      </div>
    );
  }

  return <AppShell brewStatus={status} brewChecking={checking} />;
}

export default App;
