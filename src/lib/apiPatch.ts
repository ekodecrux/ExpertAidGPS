// Intercept relative fetch calls to resolve them to absolute URLs on mobile / native applications
// This prevents Capacitor from intercepting relative calls and returning the offline index.html file (causing JSON parse errors)

export function isNativeApp(): boolean {
  const saved = localStorage.getItem('API_BASE_URL');
  if (saved) return true;

  const currentOrigin = window.location.origin || '';
  const href = window.location.href || '';
  
  const isCapacitor = 
    !!(window as any).Capacitor || 
    navigator.userAgent.toLowerCase().includes('capacitor') || 
    currentOrigin.startsWith('capacitor://') ||
    href.startsWith('capacitor://') ||
    currentOrigin.startsWith('file://') ||
    href.startsWith('file://') ||
    (currentOrigin.includes('localhost') && window.location.port !== '3000' && window.location.port !== '5173');

  return isCapacitor;
}

export function getBackendUrl(): string {
  const PUBLIC_URL = 'https://4000-i8n8af5d3nemhmlh8lv70-48428903.sg1.manus.computer';
  const saved = localStorage.getItem('API_BASE_URL');

  if (saved && saved.trim()) {
    const cleanSaved = saved.trim().replace(/\/$/, '');
    // Auto-migrate old dev URLs (ais-dev) to public preview URL (ais-pre) which doesn't require Google dev login cookies
    if (cleanSaved.includes('ais-dev-')) {
      localStorage.setItem('API_BASE_URL', PUBLIC_URL);
      return PUBLIC_URL;
    }
    return cleanSaved;
  }

  if ((import.meta as any).env?.VITE_API_BASE_URL) {
    const envUrl = ((import.meta as any).env.VITE_API_BASE_URL as string).trim().replace(/\/$/, '');
    if (envUrl.includes('ais-dev-')) {
      return PUBLIC_URL;
    }
    return envUrl;
  }

  return PUBLIC_URL;
}

export function setBackendUrl(url: string) {
  if (!url) {
    localStorage.removeItem('API_BASE_URL');
  } else {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    localStorage.setItem('API_BASE_URL', cleanUrl.replace(/\/$/, ''));
  }
}

// Monkey-patch window.fetch using Object.defineProperty to bypass read-only getter restrictions
const originalFetch = window.fetch;

Object.defineProperty(window, 'fetch', {
  value: function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let urlStr = '';

    if (typeof input === 'string') {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.toString();
    } else if (input && typeof (input as any).url === 'string') {
      urlStr = (input as any).url;
    }

    let isApiCall = false;
    let apiPath = '';

    if (urlStr.startsWith('/api/')) {
      isApiCall = true;
      apiPath = urlStr;
    } else if (urlStr.startsWith('api/')) {
      isApiCall = true;
      apiPath = '/' + urlStr;
    } else {
      try {
        const parsed = new URL(urlStr, window.location.origin || 'https://localhost');
        if (parsed.pathname.startsWith('/api/')) {
          if (
            isNativeApp() || 
            parsed.hostname === 'localhost' || 
            parsed.hostname === '127.0.0.1' || 
            parsed.protocol === 'capacitor:' || 
            parsed.protocol === 'file:'
          ) {
            isApiCall = true;
            apiPath = parsed.pathname + parsed.search;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    if (isApiCall && (isNativeApp() || !window.location.origin.includes('run.app'))) {
      const baseUrl = getBackendUrl();
      const targetUrl = `${baseUrl}${apiPath}`;

      if (typeof input === 'string') {
        return originalFetch(targetUrl, init);
      } else if (input instanceof URL) {
        return originalFetch(new URL(targetUrl), init);
      } else {
        try {
          const newReq = new Request(targetUrl, input as Request);
          return originalFetch(newReq, init);
        } catch (e) {
          return originalFetch(targetUrl, init);
        }
      }
    }

    return originalFetch(input, init);
  },
  writable: true,
  configurable: true,
  enumerable: true
});
