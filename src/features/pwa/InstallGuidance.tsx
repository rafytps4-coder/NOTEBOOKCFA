import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/** How to install: iPad Safari has no install prompt, so we explain; other browsers get a button. */
export function InstallGuidance() {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  return (
    <>
      <h2 id="install">Install on your home screen</h2>
      {standalone ? (
        <p>Notebook is installed and running as an app.</p>
      ) : (
        <>
          <p>
            Installing gives Notebook its own icon, full-screen writing space and offline use. On an{' '}
            <strong>iPad or iPhone</strong> (Safari): tap the <strong>Share</strong> button, choose{' '}
            <strong>Add to Home Screen</strong>, then <strong>Add</strong>. Open Notebook from the
            new icon afterwards.
          </p>
          {deferred && (
            <button className="btn" onClick={() => void deferred.prompt()}>
              Install Notebook
            </button>
          )}
        </>
      )}
    </>
  );
}
