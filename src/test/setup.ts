import '@testing-library/jest-dom'

// Polyfills para happy-dom
if (typeof global.navigator === 'undefined') {
  Object.defineProperty(global, 'navigator', {
    value: { clipboard: undefined },
    writable: true,
  })
}
