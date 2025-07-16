import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'fileManager',
  webDir: 'dist',
  plugins: {
    Filesystem : {
      scope : ["documents"]
    }
  }
};

export default config;
