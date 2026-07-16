// Intercept relative fetch calls to resolve them to absolute URLs on mobile / native applications
// This prevents Capacitor from intercepting relative calls and returning the offline index.html file (causing JSON parse errors)

export function isNativeApp(): boolean {
  const saved = localStorage.getItem('API_BASE_URL');
  if (saved) return true;

  const currentOrigin = window.location.origin;
  
  const isCapacitor = 
    (window as any).Capacitor || 
    navigator.userAgent.toLowerCase().includes('capacitor') || 
    currentOrigin.startsWith('capacitor://');

  return !!isCapacitor;
}

export function getBackendUrl(): string {
  const saved = localStorage.getItem('API_BASE_URL');
  if (saved) {
    return saved.trim().replace(/\/$/, '');
  }

  // Default to the deployed web server
  return 'https://expertaidgps-utabsjvh.manus.space';
}

export function setBackendUrl(url: string) {
  if (!url) {
    localStorage.removeItem('API_BASE_URL');
  } else {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'http://' + cleanUrl;
    }
    localStorage.setItem('API_BASE_URL', cleanUrl);
  }
}

// Monkey-patch window.fetch using Object.defineProperty to bypass read-only getter restrictions
try {
  const originalFetch = window.fetch;
  Object.defineProperty(window, 'fetch', {
    value: function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      if (!isNativeApp()) {
        // In normal browser environments (development & shared preview iframe), pass through directly
        // This prevents CORS and Request cloning errors and ensures original fetch behavior
        return originalFetch(input, init);
      }

      let url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request).url);

      if (url.startsWith('/api/')) {
        const base = getBackendUrl();
        const cleanPath = url.startsWith('/') ? url : '/' + url;
        url = `${base}${cleanPath}`;
      }

      if (typeof input === 'string') {
        return originalFetch(url, init);
      } else if (input instanceof URL) {
        return originalFetch(new URL(url), init);
      } else {
        // If input is a Request object, clone it with the updated URL
        try {
          const newRequest = new Request(url, input as Request);
          return originalFetch(newRequest, init);
        } catch (e) {
          // Fallback
          return originalFetch(url, init);
        }
      }
    },
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  console.warn('Failed to monkey-patch fetch:', e);
  // Continue anyway - fetch will work normally
}
