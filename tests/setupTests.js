const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = {
  userAgent: 'node.js',
};

class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return this.store[key] || null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }
}

Object.defineProperty(global.window, 'localStorage', {
  value: new LocalStorageMock(),
  writable: true
});

Object.defineProperty(global.window, 'sessionStorage', {
  value: new LocalStorageMock(),
  writable: true
});

global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;

// Suppress console.error for localStorage-related errors
const originalConsoleError = console.error;
console.error = (...args) => {
  if (!args[0].includes('localStorage')) {
    originalConsoleError(...args);
  }
};
