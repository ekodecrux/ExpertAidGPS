import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.expertgpstracking.app',
  appName: 'Expert GPS Tracking',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'expertgpstracking.app',
    allowNavigation: ['expertgpstracking.app', '*.expertgpstracking.app']
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
