import { useBrew } from "./hooks/useBrew";
import { AppLayout } from "./components/AppLayout";
import { InstallBrew } from "./components/InstallBrew";
import "./App.css";

function App() {
  const { status, checking, refresh } = useBrew();

  const showInstallBrew = status !== null && !status.installed;

  if (showInstallBrew) {
    return (
      <div className="app-shell">
        <InstallBrew onRecheck={refresh} checking={checking} />
        <div className="browse-without-brew">
          <p className="section-label">Browse without Homebrew</p>
          <AppLayout brewStatus={status} brewChecking={checking} />
        </div>
      </div>
    );
  }

  return <AppLayout brewStatus={status} brewChecking={checking} />;
}

export default App;
