import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.expertaid.gpstracking',
  appName: 'Expert GPS Tracking',
  webDir: 'dist',
  version: '1.0.0',
  server: {
    androidScheme: 'https',
    hostname: 'expertgpstracking.app',
    allowNavigation: ['expertgpstracking.app', '*.expertgpstracking.app', 'login.expertaidgps.in', '*']
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#3b82f6'
    }
  }
};

export default config;
