import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createApiLoader } from '../../../utils/apiLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const platform = process.platform || os.platform();
const isMac = platform === 'darwin';
// const isWin = platform === 'win32';

const apiDir = resolve(__dirname, 'api');
const apiLoader = createApiLoader(apiDir, 'index.js');
const apiReady = apiLoader.load();

export default {
  meta: {
    name: 'DICOM Servers',
    version: '1.0.0',
    description: 'A PACS client module for PMTaro.',
  },
  async setup(ctx = {/* __file__, __name__, __author__, __version__ */}, electronApp) {
    return electronApp.whenReady().then(() => {
      // ...
    });
  },
  ui: {
    entry: 'ui/index.html',
    windowOptions: {
      width: 1024,
      height: 768,
      minWidth: 500,
      minHeight: 300,
    },
  },
  api: {
    test: (...args) => ({ args }),

    pacsConnect: async (...args) => apiReady.then(api => apiLoader.run(api.pacsConnect)(...args)),
    pacsSearch: async (...args) => apiReady.then(api => apiLoader.run(api.pacsSearch)(...args)),
    pacsDownload: async (...args) => apiReady.then(api => apiLoader.run(api.pacsDownload)(...args)),
    pacsUpload: async (...args) => apiReady.then(api => apiLoader.run(api.pacsUpload)(...args)),

    // ...
  },
};
