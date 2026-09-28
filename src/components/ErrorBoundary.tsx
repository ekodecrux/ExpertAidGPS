import React, { Component, ErrorInfo, ReactNode } from 'react';
import { getBackendUrl, setBackendUrl, DEFAULT_PRODUCTION_URL } from '../lib/apiPatch';
import { AlertTriangle, RefreshCw, Server, LogOut } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showServerModal: boolean;
  serverUrlInput: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    showServerModal: false,
    serverUrlInput: getBackendUrl(),
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      showServerModal: false,
      serverUrlInput: getBackendUrl(),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCache = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  private handleSaveServerUrl = () => {
    setBackendUrl(this.state.serverUrlInput);
    this.setState({ showServerModal: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 font-sans">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-6 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl mx-auto flex items-center justify-center border border-rose-500/30">
              <AlertTriangle size={32} />
            </div>

            <div>
              <h2 className="text-xl font-black uppercase tracking-tight italic">
                Application Recovered
              </h2>
              <p className="text-xs font-bold text-slate-400 mt-2 leading-relaxed">
                An unexpected issue occurred while displaying this page. Your session is safe.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[10px] font-mono text-rose-300 text-left overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="space-y-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30"
              >
                <RefreshCw size={16} />
                Reload Application
              </button>

              <button
                onClick={() => this.setState({ showServerModal: true })}
                className="w-full py-3.5 bg-slate-700 text-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Server size={16} />
                Check Server API URL
              </button>

              <button
                onClick={this.handleClearCache}
                className="w-full py-3 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-2xl font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                <LogOut size={14} />
                Reset Cache & Logout
              </button>
            </div>

            {this.state.showServerModal && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 max-w-sm w-full text-left space-y-4">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    Server API Endpoint
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    If your APK is failing to connect to the backend, ensure the server URL is correct:
                  </p>
                  <input
                    type="url"
                    value={this.state.serverUrlInput}
                    onChange={(e) => this.setState({ serverUrlInput: e.target.value })}
                    placeholder={DEFAULT_PRODUCTION_URL}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => this.setState({ showServerModal: false })}
                      className="flex-1 py-2.5 bg-slate-700 text-slate-300 rounded-xl font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={this.handleSaveServerUrl}
                      className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs"
                    >
                      Save & Reconnect
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
