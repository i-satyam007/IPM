import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.ipmtracker',
  appName: 'IPM Tracker',
  webDir: 'out',
  server: {
    // Replace this with your deployed Vercel URL (e.g. https://my-app.vercel.app)
    // url: 'http://192.168.1.x:3000', 
    cleartext: true
  }
};

export default config;
