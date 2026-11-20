// Capacitor configuration for packaging Starloom into an Android APK/AAB for TapTap
export default {
  appId: 'com.starloom.bastion',
  appName: '星枢织阵 Starloom',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#13222b',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};
