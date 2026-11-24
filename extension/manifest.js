import { EXTENSION_PUBLIC_KEY, SURFARE_ORIGIN } from './identity.js';
export const manifest = {
  manifest_version: 3, name: 'Surfare — Check with Surfy', version: '1.0.0',
  description: 'Check selected messages, links and images for warning signs, with simple results and Ask Surfy.',
  minimum_chrome_version: '116', key: EXTENSION_PUBLIC_KEY,
  permissions: ['contextMenus', 'sidePanel', 'storage', 'activeTab'],
  host_permissions: [`${SURFARE_ORIGIN}/*`, 'http://127.0.0.1:8790/*', 'http://localhost:8790/*'],
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_title: 'Open Surfare' },
  side_panel: { default_path: 'sidepanel.html' },
  icons: { 16: 'assets/pwa-64x64.png', 48: 'assets/pwa-64x64.png', 128: 'assets/pwa-192x192.png' },
  content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none';" },
};
