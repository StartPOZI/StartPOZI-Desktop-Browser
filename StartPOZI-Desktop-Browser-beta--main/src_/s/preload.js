// Минимальный preload.js для Electron
// Можно оставить пустым для безопасности 

// Preload.js для ZhukBrowse
const { contextBridge, ipcRenderer } = require('electron');

// Обработка ошибок
window.addEventListener('error', (event) => {
  console.error('Preload error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// === Анти-отпечаток WebRTC ===
try {
  // Отключаем WebRTC (RTCPeerConnection)
  Object.defineProperty(window, 'RTCPeerConnection', {
    get: () => undefined
  });
  Object.defineProperty(window, 'webkitRTCPeerConnection', {
    get: () => undefined
  });
} catch (e) {
  // fallback
  window.RTCPeerConnection = undefined;
  window.webkitRTCPeerConnection = undefined;
}

// === Анти-отпечаток Canvas ===
(function() {
  const addNoise = (canvas, ctx) => {
    // Добавляем шум к каждому пикселю
    const shift = Math.floor(Math.random() * 10) - 5;
    const width = canvas.width;
    const height = canvas.height;
    if (width && height) {
      const imageData = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i + 0] += shift;
        imageData.data[i + 1] += shift;
        imageData.data[i + 2] += shift;
      }
      ctx.putImageData(imageData, 0, 0);
    }
  };

  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) addNoise(this, ctx);
    return origToDataURL.apply(this, args);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) addNoise(this, ctx);
    return origToBlob.apply(this, args);
  };
})();

// === Spoof User-Agent и Accept-Language ===
try {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    configurable: true
  });
  Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
  Object.defineProperty(navigator, 'languages', { value: ['en-US', 'en'], configurable: true });
} catch(e) {}

// === Spoof Timezone (UTC) ===
try {
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'resolvedOptions', {
    value: function() { return { timeZone: 'UTC' }; },
    configurable: true
  });
  Object.defineProperty(Date.prototype, 'getTimezoneOffset', {
    value: function() { return 0; },
    configurable: true
  });
  Object.defineProperty(Date.prototype, 'toString', {
    value: function() { return `${this.toDateString()} 00:00:00 GMT+0000 (Coordinated Universal Time)`; },
    configurable: true
  });
} catch(e) {}

// === Spoof Fonts (только 6 стандартных) ===
try {
  const fakeFonts = ["Arial", "Verdana", "Times New Roman", "Courier New", "Georgia", "Tahoma"];
  document.__defineGetter__('fonts', () => ({
    entries: () => fakeFonts.map(f => [f]),
    values: () => fakeFonts,
    forEach: (cb) => fakeFonts.forEach(cb),
    size: fakeFonts.length
  }));
  window.getComputedStyle = (el) => ({
    getPropertyValue: (prop) => {
      if (prop === 'font-family') return fakeFonts.join(', ');
      return '';
    }
  });
} catch(e) {}

// === Spoof Plugins/mimeTypes (пусто) ===
try {
  Object.defineProperty(navigator, 'plugins', { value: [], configurable: true });
  Object.defineProperty(navigator, 'mimeTypes', { value: [], configurable: true });
} catch(e) {}

// === Spoof Screen/Window (1920x1080) ===
try {
  Object.defineProperty(window, 'screen', {
    value: {
      width: 1920,
      height: 1080,
      availWidth: 1920,
      availHeight: 1040,
      colorDepth: 24,
      pixelDepth: 24
    },
    configurable: true
  });
  Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 1040, configurable: true });
  Object.defineProperty(window, 'outerWidth', { value: 1920, configurable: true });
  Object.defineProperty(window, 'outerHeight', { value: 1080, configurable: true });
} catch(e) {}

// === Spoof WebGL (Intel Inc., 2 расширения) ===
try {
  const origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'Intel Iris OpenGL Engine';
    return origGetParameter.apply(this, arguments);
  };
  WebGLRenderingContext.prototype.getSupportedExtensions = function() {
    return ['OES_element_index_uint', 'OES_standard_derivatives'];
  };
} catch(e) {}

// === Spoof MediaDevices (пусто) ===
try {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      enumerateDevices: () => Promise.resolve([]),
      getUserMedia: () => Promise.reject(new Error('Not allowed')),
      ondevicechange: null
    },
    configurable: true
  });
} catch(e) {}

// === Spoof HardwareConcurrency/DeviceMemory (4) ===
try {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
  Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });
} catch(e) {}

// === Spoof AudioContext (sampleRate 44100) ===
try {
  Object.defineProperty(AudioContext.prototype, 'sampleRate', { value: 44100, configurable: true });
  Object.defineProperty(window, 'AudioContext', { value: AudioContext, configurable: true });
} catch(e) {}

// === Удалить лишние свойства из navigator/window ===
try {
  delete window.process;
  delete window.versions;
  delete window.require;
  if (window.hasOwnProperty('electron')) delete window.electron;
  for (let key in navigator) {
    if ([
      'userAgent','platform','hardwareConcurrency','deviceMemory','languages','language','plugins','mimeTypes','mediaDevices','connection','getBattery','permissions','clipboard','maxTouchPoints','webdriver'
    ].indexOf(key) === -1) {
      try { delete navigator[key]; } catch(e) {}
    }
  }
} catch(e) {}

// === Spoof Touch Events ===
try {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  Object.defineProperty(window, 'ontouchstart', { value: undefined, configurable: true });
} catch(e) {}

// === Spoof SpeechSynthesis/SpeechRecognition ===
try {
  Object.defineProperty(window, 'speechSynthesis', {
    value: { getVoices: () => [] },
    configurable: true
  });
  Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
} catch(e) {}

// === Spoof Clipboard API ===
try {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: () => Promise.reject(new Error('Clipboard access denied')),
      readText: () => Promise.resolve('')
    },
    configurable: true
  });
} catch(e) {}

// === Spoof WebGL Extensions ===
try {
  const origGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
  WebGLRenderingContext.prototype.getSupportedExtensions = function() {
    return ['OES_element_index_uint', 'OES_standard_derivatives', 'OES_texture_float'];
  };
} catch(e) {}

// === Spoof Math.random ===
try {
  const origRandom = Math.random;
  Math.random = function() {
    return origRandom() * 0.999999 + 0.000001;
  };
} catch(e) {}

// === Spoof window.outerWidth/outerHeight ===
try {
  Object.defineProperty(window, 'outerWidth', { value: 1920, configurable: true });
  Object.defineProperty(window, 'outerHeight', { value: 1080, configurable: true });
} catch(e) {}

// === Spoof window.chrome ===
try {
  Object.defineProperty(window, 'chrome', {
    value: { runtime: {} },
    configurable: true
  });
} catch(e) {}

// Проверка: если не vk.com — выполнять spoof, иначе только базовые обработчики
if (!window.location.hostname.includes('vk.com')) {
  // === Prefers-color-scheme spoof для webview (жёстко для светлой темы) ===
  try {
    const { ipcRenderer } = require('electron');
    ipcRenderer.invoke('get-browser-theme').then(theme => {
      const prefers = (theme === 'dark') ? 'dark' : 'light';
      // Проверяем, выбрал ли пользователь тему на сайте
      let userTheme = null;
      try {
        userTheme = localStorage.getItem('theme') || localStorage.getItem('force_dark_theme') || localStorage.getItem('dark_mode') || localStorage.getItem('yt_dark_mode');
        if (!userTheme) {
          // Пробуем найти в cookie
          const cookies = document.cookie.split(';').map(x => x.trim());
          for (const c of cookies) {
            if (c.startsWith('theme=') || c.startsWith('force_dark_theme=') || c.startsWith('dark_mode=') || c.startsWith('yt_dark_mode=')) {
              userTheme = c;
              break;
            }
          }
        }
      } catch(e) {}
      if (!userTheme) {
        // Пользователь не выбирал тему — spoof prefers-color-scheme
        if (prefers === 'light') {
          // Подменяем matchMedia
          Object.defineProperty(window, 'matchMedia', {
            value: (q) => ({
              matches: q.includes('dark') ? false : true,
              media: q,
              onchange: null,
              addListener: () => {},
              removeListener: () => {},
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false
            }),
            configurable: true
          });
          // Устанавливаем color-scheme
          document.documentElement.style.colorScheme = 'light';
          // Добавляем meta color-scheme
          let meta = document.querySelector('meta[name="color-scheme"]');
          if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'color-scheme';
            document.head.appendChild(meta);
          }
          meta.content = 'light';
          // Подменяем CSS.supports
          if (window.CSS && typeof window.CSS.supports === 'function') {
            const origSupports = window.CSS.supports;
            window.CSS.supports = function(prop, value) {
              if (prop === '(prefers-color-scheme: dark)' || prop === '(prefers-color-scheme: light)') {
                return prop === '(prefers-color-scheme: light)';
              }
              return origSupports.call(this, prop, value);
            };
          }
          // Подменяем navigator.userAgentData.hints если возможно
          if (window.navigator.userAgentData && window.navigator.userAgentData.getHighEntropyValues) {
            const origGetHighEntropyValues = window.navigator.userAgentData.getHighEntropyValues;
            window.navigator.userAgentData.getHighEntropyValues = function(hints) {
              if (Array.isArray(hints) && hints.includes('prefers-color-scheme')) {
                return Promise.resolve({ 'prefers-color-scheme': 'light' });
              }
              return origGetHighEntropyValues.call(this, hints);
            };
          }
          // Принудительно сбрасываем тему на светлую для всех сайтов
          try {
            // Популярные ключи для светлой темы
            localStorage.setItem('theme', 'light');
            localStorage.setItem('force_dark_theme', 'false');
            localStorage.setItem('dark_mode', 'false');
            localStorage.setItem('yt_dark_mode', 'false');
            document.cookie = 'PREF=f6=400;path=/;max-age=31536000';
            document.cookie = 'SOCS=CAISBggDEJr2lAE%3D;path=/;max-age=31536000';
            // Атрибуты на html
            document.documentElement.setAttribute('dark', 'false');
            document.documentElement.setAttribute('light', 'true');
          } catch(e) {}
        } else {
          // Для dark — как раньше
          Object.defineProperty(window, 'matchMedia', {
            value: (q) => ({
              matches: q.includes('dark'),
              media: q,
              onchange: null,
              addListener: () => {},
              removeListener: () => {},
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false
            }),
            configurable: true
          });
          document.documentElement.style.colorScheme = 'dark';
          let meta = document.querySelector('meta[name="color-scheme"]');
          if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'color-scheme';
            document.head.appendChild(meta);
          }
          meta.content = 'dark';
        }
      } // else: пользователь выбрал тему — не вмешиваемся
    });
  } catch(e) {}
  // === Spoof Fonts (только 6 стандартных) ===
  try {
    const fakeFonts = ["Arial", "Verdana", "Times New Roman", "Courier New", "Georgia", "Tahoma"];
    document.__defineGetter__('fonts', () => ({
      entries: () => fakeFonts.map(f => [f]),
      values: () => fakeFonts,
      forEach: (cb) => fakeFonts.forEach(cb),
      size: fakeFonts.length
    }));
    window.getComputedStyle = (el) => ({
      getPropertyValue: (prop) => {
        if (prop === 'font-family') return fakeFonts.join(', ');
        return '';
      }
    });
  } catch(e) {}

  // === Spoof Plugins/mimeTypes (пусто) ===
  try {
    Object.defineProperty(navigator, 'plugins', { value: [], configurable: true });
    Object.defineProperty(navigator, 'mimeTypes', { value: [], configurable: true });
  } catch(e) {}

  // === Spoof Screen/Window (1920x1080) ===
  try {
    Object.defineProperty(window, 'screen', {
      value: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24
      },
      configurable: true
    });
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1040, configurable: true });
    Object.defineProperty(window, 'outerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 1080, configurable: true });
  } catch(e) {}

  // === Spoof WebGL (Intel Inc., 2 расширения) ===
  try {
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return origGetParameter.apply(this, arguments);
    };
    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      return ['OES_element_index_uint', 'OES_standard_derivatives'];
    };
  } catch(e) {}

  // === Spoof MediaDevices (пусто) ===
  try {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        enumerateDevices: () => Promise.resolve([]),
        getUserMedia: () => Promise.reject(new Error('Not allowed')),
        ondevicechange: null
      },
      configurable: true
    });
  } catch(e) {}

  // === Spoof HardwareConcurrency/DeviceMemory (4) ===
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 4, configurable: true });
  } catch(e) {}

  // === Spoof AudioContext (sampleRate 44100) ===
  try {
    Object.defineProperty(AudioContext.prototype, 'sampleRate', { value: 44100, configurable: true });
    Object.defineProperty(window, 'AudioContext', { value: AudioContext, configurable: true });
  } catch(e) {}

  // === Удалить лишние свойства из navigator/window ===
  try {
    delete window.process;
    delete window.versions;
    delete window.require;
    if (window.hasOwnProperty('electron')) delete window.electron;
    for (let key in navigator) {
      if ([
        'userAgent','platform','hardwareConcurrency','deviceMemory','languages','language','plugins','mimeTypes','mediaDevices','connection','getBattery','permissions','clipboard','maxTouchPoints','webdriver'
      ].indexOf(key) === -1) {
        try { delete navigator[key]; } catch(e) {}
      }
    }
  } catch(e) {}

  // === Spoof Touch Events ===
  try {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    Object.defineProperty(window, 'ontouchstart', { value: undefined, configurable: true });
  } catch(e) {}

  // === Spoof SpeechSynthesis/SpeechRecognition ===
  try {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => [] },
      configurable: true
    });
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  } catch(e) {}

  // === Spoof Clipboard API ===
  try {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => Promise.reject(new Error('Clipboard access denied')),
        readText: () => Promise.resolve('')
      },
      configurable: true
    });
  } catch(e) {}

  // === Spoof WebGL Extensions ===
  try {
    const origGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      return ['OES_element_index_uint', 'OES_standard_derivatives', 'OES_texture_float'];
    };
  } catch(e) {}

  // === Spoof Math.random ===
  try {
    const origRandom = Math.random;
    Math.random = function() {
      return origRandom() * 0.999999 + 0.000001;
    };
  } catch(e) {}

  // === Spoof window.outerWidth/outerHeight ===
  try {
    Object.defineProperty(window, 'outerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'outerHeight', { value: 1080, configurable: true });
  } catch(e) {}

  // === Spoof window.chrome ===
  try {
    Object.defineProperty(window, 'chrome', {
      value: { runtime: {} },
      configurable: true
    });
  } catch(e) {}
}

// Экспортируем API в renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  version: process.versions.electron,
  openIncognitoWindow: () => ipcRenderer.send('open-incognito-window'),
  // API для обновлений
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  fetchBackgroundImage: (url) => ipcRenderer.invoke('fetch-background-image', url),
  // --- Управление окном ---
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setTitlebarStyle: (style) => ipcRenderer.send('set-titlebar-style', style),
  getTitlebarStyle: () => ipcRenderer.invoke('get-titlebar-style'),
  // --- Управление прокси/VPN ---
  setProxy: (proxyRules) => ipcRenderer.invoke('set-proxy', proxyRules),
  clearProxy: () => ipcRenderer.invoke('clear-proxy'),
  clearProxyKeepIP: (fakeIP) => {
    console.log('preload: clearProxyKeepIP called with fakeIP:', fakeIP);
    return ipcRenderer.invoke('clear-proxy-keep-ip', fakeIP);
  },
  clearWindowsProxy: () => ipcRenderer.invoke('clear-windows-proxy'),
  reloadApp: () => ipcRenderer.invoke('reload-app'),
  restartSystem: () => ipcRenderer.invoke('restart-system'),
}); 

contextBridge.exposeInMainWorld('terminalAPI', {
  send: (data) => ipcRenderer.send('terminal-input', data),
  onData: (cb) => ipcRenderer.on('terminal-output', (event, data) => cb(data)),
  onExit: (cb) => ipcRenderer.on('terminal-exit', (event, code) => cb(code)),
  start: () => ipcRenderer.send('terminal-start')
}); 

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  ipcRenderer.send('show-context-menu', {
    x: event.x,
    y: event.y
  });
}); 