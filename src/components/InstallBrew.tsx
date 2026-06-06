import "./InstallBrew.css";

const MAC_INSTALL =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

const LINUX_INSTALL =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

interface InstallBrewProps {
  onRecheck: () => void;
  checking: boolean;
}

export function InstallBrew({ onRecheck, checking }: InstallBrewProps) {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  return (
    <div className="install-brew">
      <h1>Homebrew not found</h1>
      <p>
        Brew Versionneer needs the Homebrew CLI to list installed packages. Install
        Homebrew using the command below, then click Check again.
      </p>

      <section>
        <h2>{isMac ? "macOS" : "Linux / macOS"}</h2>
        <pre className="install-command">{isMac ? MAC_INSTALL : LINUX_INSTALL}</pre>
        {!isMac && (
          <p className="install-note">
            See{" "}
            <a
              href="https://docs.brew.sh/Homebrew-on-Linux"
              target="_blank"
              rel="noreferrer"
            >
              Homebrew on Linux
            </a>{" "}
            for distribution-specific notes.
          </p>
        )}
      </section>

      <section>
        <h2>After installing</h2>
        <ul>
          <li>Follow any post-install PATH instructions from the installer.</li>
          <li>Restart this app if brew still is not detected.</li>
        </ul>
      </section>

      <button type="button" onClick={onRecheck} disabled={checking}>
        {checking ? "Checking…" : "Check again"}
      </button>

      <p className="install-remote-note">
        You can still browse the public Formulae and Casks catalogs without Homebrew.
      </p>
    </div>
  );
}
