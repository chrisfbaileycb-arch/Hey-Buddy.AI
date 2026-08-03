import { assert } from 'console';
import { shouldShowSandboxNotice, markSandboxNoticeSeen, showSandboxNotice } from '../../app/js/sandbox-notice.js';

// Setup Mock DOM
const mockLocalStorage = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = String(value);
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

globalThis.localStorage = mockLocalStorage;

const mockDocument = {
  body: {
    children: [],
    appendChild(element) {
      this.children.push(element);
      element.parentNode = this;
    },
    removeChild(element) {
      const idx = this.children.indexOf(element);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        element.parentNode = null;
      }
    }
  },
  createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      innerHTML: '',
      parentNode: null,
      listeners: {},
      addEventListener(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
      },
      dispatchEvent(event) {
        const type = typeof event === 'string' ? event : event.type;
        if (this.listeners[type]) {
          for (const cb of this.listeners[type]) {
            cb.call(this, event);
          }
        }
      },
      querySelector(selector) {
        if (selector === '#hb-sb-ack') {
          return this._ackEl;
        }
        if (selector === '#hb-sb-continue') {
          return this._continueEl;
        }
        return null;
      },
      remove() {
        if (this.parentNode) {
          this.parentNode.removeChild(this);
        }
      }
    };
    
    const ack = {
      tagName: 'INPUT',
      checked: false,
      listeners: {},
      addEventListener(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
      },
      dispatchEvent(event) {
        const type = typeof event === 'string' ? event : event.type;
        if (this.listeners[type]) {
          for (const cb of this.listeners[type]) {
            cb.call(this, event);
          }
        }
      },
      focus() {
        this.focused = true;
      }
    };

    const btn = {
      tagName: 'BUTTON',
      disabled: true,
      listeners: {},
      addEventListener(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
      },
      dispatchEvent(event) {
        const type = typeof event === 'string' ? event : event.type;
        if (this.listeners[type]) {
          for (const cb of this.listeners[type]) {
            cb.call(this, event);
          }
        }
      }
    };

    el._ackEl = ack;
    el._continueEl = btn;
    return el;
  }
};

globalThis.document = mockDocument;
globalThis.window = globalThis;
globalThis.setTimeout = (callback, delay) => {
  callback();
  return 1;
};

// Start tests
async function runTests() {
  console.log("=== Running Sandbox Notice Unit Tests ===");

  // 1. Initial state (should show sandbox notice)
  mockLocalStorage.clear();
  console.log("Test 1: Initial shouldShowSandboxNotice");
  assert(shouldShowSandboxNotice() === true, "Initially, shouldShowSandboxNotice should return true");
  console.log("Pass: shouldShowSandboxNotice is true");

  // 2. Marking seen manually
  console.log("Test 2: Mark seen manually");
  markSandboxNoticeSeen();
  assert(shouldShowSandboxNotice() === false, "After marking seen, shouldShowSandboxNotice should return false");
  console.log("Pass: shouldShowSandboxNotice is false after manual mark");

  // Reset local storage
  mockLocalStorage.clear();
  assert(shouldShowSandboxNotice() === true, "Should return true after clear");

  // 3. showSandboxNotice appends to document and wires events
  console.log("Test 3: showSandboxNotice behavior when unseen");
  let resolvedValue = null;
  const promise = showSandboxNotice().then(v => { resolvedValue = v; });

  // Document body should have 1 child (the overlay)
  assert(mockDocument.body.children.length === 1, "Overlay should be added to body");
  const overlay = mockDocument.body.children[0];
  assert(overlay.className === 'hb-sandbox-overlay', "Overlay class name should match");

  const ack = overlay.querySelector('#hb-sb-ack');
  const btn = overlay.querySelector('#hb-sb-continue');

  assert(ack.focused === true, "Ack element should have been focused via setTimeout");
  assert(btn.disabled === true, "Continue button should be disabled initially");

  // Simulate checking the box
  ack.checked = true;
  ack.dispatchEvent('change');
  assert(btn.disabled === false, "Continue button should be enabled when ack is checked");

  // Simulate unchecking the box
  ack.checked = false;
  ack.dispatchEvent('change');
  assert(btn.disabled === true, "Continue button should be disabled when ack is unchecked");

  // Recheck and click continue
  ack.checked = true;
  ack.dispatchEvent('change');
  assert(btn.disabled === false, "Continue button enabled");

  btn.dispatchEvent('click');

  // Wait briefly for microtask queue to process Promise resolution
  await promise;

  assert(resolvedValue === true, "showSandboxNotice promise should resolve to true");
  assert(mockLocalStorage.getItem('heybuddy.sandboxNoticeSeen.v1') === '1', "LocalStorage should have marked notice as seen");
  assert(mockDocument.body.children.length === 0, "Overlay should have been removed from document body");
  console.log("Pass: showSandboxNotice lifecycle tests completed successfully");

  // 4. showSandboxNotice when already seen
  console.log("Test 4: showSandboxNotice when already seen");
  assert(shouldShowSandboxNotice() === false, "Notice already marked seen");
  
  let resolvedFalse = null;
  await showSandboxNotice().then(v => { resolvedFalse = v; });
  assert(resolvedFalse === false, "Promise should resolve to false immediately when not forced and already seen");
  assert(mockDocument.body.children.length === 0, "No element should be added when already seen");
  console.log("Pass: showSandboxNotice does not show if already seen");

  // 5. showSandboxNotice with force option
  console.log("Test 5: showSandboxNotice with force option when already seen");
  let resolvedForced = null;
  const promiseForce = showSandboxNotice({ force: true }).then(v => { resolvedForced = v; });
  assert(mockDocument.body.children.length === 1, "Element should be added when forced even if already seen");
  
  const forceOverlay = mockDocument.body.children[0];
  const forceAck = forceOverlay.querySelector('#hb-sb-ack');
  const forceBtn = forceOverlay.querySelector('#hb-sb-continue');

  forceAck.checked = true;
  forceAck.dispatchEvent('change');
  forceBtn.dispatchEvent('click');

  await promiseForce;
  assert(resolvedForced === true, "Forced notice resolved to true");
  assert(mockDocument.body.children.length === 0, "Overlay removed");
  console.log("Pass: showSandboxNotice force option works correctly");

  console.log("=== All Tests Passed Successfully ===");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
