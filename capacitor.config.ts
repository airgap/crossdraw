import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.crossdraw.app',
  appName: 'Crossdraw',
  webDir: 'dist',
  server: {
    // In production, load from the bundled web assets
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      signingType: 'apksigner',
    },
  },
  ios: {
    scheme: 'Crossdraw',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      backgroundColor: '#1a1a1a',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a1a',
    },
  },
}

export default config
