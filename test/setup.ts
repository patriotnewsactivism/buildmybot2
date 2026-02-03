import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfills for pdfjs-dist / jsdom environment compatibility
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;

    translate() {
      return this;
    }
    scale() {
      return this;
    }
    rotate() {
      return this;
    }
    multiply() {
      return this;
    }
    transformPoint() {
      return { x: 0, y: 0, z: 0, w: 1 };
    }
    inverse() {
      return this;
    }
  } as any;
}

if (typeof global.ImageData === 'undefined') {
  global.ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    colorSpace: PredefinedColorSpace = 'srgb';

    constructor(sw: number, sh: number) {
      this.width = sw;
      this.height = sh;
      this.data = new Uint8ClampedArray(sw * sh * 4);
    }
  } as any;
}

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
