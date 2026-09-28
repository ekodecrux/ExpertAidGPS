// Intercept relative fetch calls to resolve them to absolute URLs on mobile / native applications
// This prevents Capacitor from intercepting relative calls and returning the offline index.html file (causing JSON parse errors)

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;

  const currentOrigin = window.location.origin || '';
  const href = window.location.href || '';
  
  const isCapacitor = 
    !!(window as any).Capacitor || 
    navigator.userAgent.toLowerCase().includes('capacitor') || 
    currentOrigin.startsWith('capacitor://') ||
    href.startsWith('capacitor://') ||
    currentOrigin.startsWith('file://') ||
    href.startsWith('file://');

  return isCapacitor;
}

export const DEFAULT_PRODUCTION_URL = 'https://expertaidgps-utabsjvh.manus.space';

export function getBackendUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('API_BASE_URL');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/$/, '');
    }
  }

  // For native apps (Capacitor/Android), use default production URL if not overridden
  if (isNativeApp()) {
    console.log('[getBackendUrl] Native app detected, using production URL:', DEFAULT_PRODUCTION_URL);
    return DEFAULT_PRODUCTION_URL;
  }

  if ((import.meta as any).env?.VITE_API_BASE_URL) {
    const envUrl = ((import.meta as any).env.VITE_API_BASE_URL as string).trim().replace(/\/$/, '');
    if (envUrl) {
      return envUrl;
    }
  }

  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
    return window.location.origin;
  }

  return DEFAULT_PRODUCTION_URL;
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
    }

    const customBaseUrl = typeof window !== 'undefined' ? localStorage.getItem('API_BASE_URL') : null;
    const shouldRewrite = isApiCall && (isNativeApp() || (!!customBaseUrl && customBaseUrl.trim().length > 0));

    if (shouldRewrite) {
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
