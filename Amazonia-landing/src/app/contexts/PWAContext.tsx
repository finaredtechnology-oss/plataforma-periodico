import React, { createContext, useContext, useEffect, useState } from 'react';

interface PWAContextType {
  isInstallable: boolean;
  installPWA: () => Promise<boolean>;
}

const PWAContext = createContext<PWAContextType>({
  isInstallable: false,
  installPWA: async () => false,
});

export const PWAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if app is already running in standalone mode (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installPWA = async () => {
    if (!deferredPrompt) {
      console.warn("PWA installation prompt not deferred yet.");
      return false;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      return true;
    }
    return false;
  };

  return (
    <PWAContext.Provider value={{ isInstallable, installPWA }}>
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => useContext(PWAContext);
