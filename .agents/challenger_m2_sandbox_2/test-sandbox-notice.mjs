// Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  clear() {
    this.store = {};
  }
}

// Mock Element (like div, input, button, label)
class MockElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.className = '';
    this._innerHTML = '';
    this.listeners = {};
    this.children = [];
    this.disabled = false;
    this.checked = false;
    this.focused = false;
    this.parent = null;
    this.id = '';
  }

  set innerHTML(val) {
    this._innerHTML = val;
    this.children = []; // Clear
    this.parseMockInnerHTML(val);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  parseMockInnerHTML(html) {
    // Look for id="hb-sb-ack"
    if (html.includes('id="hb-sb-ack"')) {
      const ack = new MockElement('input');
      ack.id = 'hb-sb-ack';
      ack.type = 'checkbox';
      this.appendChild(ack);
    }
    // Look for id="hb-sb-continue"
    if (html.includes('id="hb-sb-continue"')) {
      const btn = new MockElement('button');
      btn.id = 'hb-sb-continue';
      btn.disabled = true;
      this.appendChild(btn);
    }
  }

  addEventListener(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  dispatchEvent(event) {
    if (this.listeners[event]) {
      for (const cb of this.listeners[event]) {
        cb();
      }
    }
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const targetId = selector.substring(1);
      return this.children.find(child => child.id === targetId) || null;
    }
    return null;
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
  }

  remove() {
    if (this.parent) {
      const idx = this.parent.children.indexOf(this);
      if (idx !== -1) {
        this.parent.children.splice(idx, 1);
      }
    }
  }

  focus() {
    this.focused = true;
  }
}

// Setup Globals BEFORE importing the ES Module
const mockLocalStorage = new MockLocalStorage();
const mockDocument = {
  body: new MockElement('body'),
  createElement(tagName) {
    return new MockElement(tagName);
  }
};

globalThis.localStorage = mockLocalStorage;
globalThis.document = mockDocument;
globalThis.window = globalThis;

// Import the Sandbox Notice module
import { shouldShowSandboxNotice, markSandboxNoticeSeen, showSandboxNotice } from '../../app/js/sandbox-notice.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log("Starting Sandbox Notice verification...");

  // 1. Initial State Assertions
  assert(shouldShowSandboxNotice() === true, "Should want to show sandbox notice initially");
  assert(mockLocalStorage.getItem('heybuddy.sandboxNoticeSeen.v1') === null, "Storage item should not exist");

  // 2. Mark Seen Assertions
  markSandboxNoticeSeen();
  assert(shouldShowSandboxNotice() === false, "Should not want to show sandbox notice after marking seen");
  assert(mockLocalStorage.getItem('heybuddy.sandboxNoticeSeen.v1') === '1', "Storage item should be '1'");

  // Reset Storage
  mockLocalStorage.clear();
  assert(shouldShowSandboxNotice() === true, "Should show again after clearing storage");

  // 3. showSandboxNotice() flow without forcing when already seen
  markSandboxNoticeSeen();
  let resolvedValue = await showSandboxNotice();
  assert(resolvedValue === false, "showSandboxNotice() should resolve to false if already seen and not forced");
  assert(mockDocument.body.children.length === 0, "No overlay should have been appended to document body");

  // Reset Storage
  mockLocalStorage.clear();

  // 4. Full modal flow
  const noticePromise = showSandboxNotice();
  assert(mockDocument.body.children.length === 1, "Overlay should be appended to body");
  
  const overlay = mockDocument.body.children[0];
  assert(overlay.tagName === 'div', "Overlay should be a div");
  assert(overlay.className === 'hb-sandbox-overlay', "Overlay class name should match");

  const ackCheckbox = overlay.querySelector('#hb-sb-ack');
  const continueBtn = overlay.querySelector('#hb-sb-continue');

  assert(ackCheckbox !== null, "Checkbox should exist in modal");
  assert(continueBtn !== null, "Continue button should exist in modal");
  assert(continueBtn.disabled === true, "Continue button should be disabled initially");

  // Check autofocus on checkbox
  await new Promise(r => setTimeout(r, 60));
  assert(ackCheckbox.focused === true, "Checkbox should be focused automatically after 50ms");

  // Toggle checkbox
  ackCheckbox.checked = true;
  ackCheckbox.dispatchEvent('change');
  assert(continueBtn.disabled === false, "Continue button should be enabled when checkbox is checked");

  // Toggle checkbox off
  ackCheckbox.checked = false;
  ackCheckbox.dispatchEvent('change');
  assert(continueBtn.disabled === true, "Continue button should be disabled when checkbox is unchecked");

  // Checkbox checked again
  ackCheckbox.checked = true;
  ackCheckbox.dispatchEvent('change');

  // Click continue
  continueBtn.dispatchEvent('click');
  
  // Wait for promise resolution
  const flowResult = await noticePromise;
  assert(flowResult === true, "showSandboxNotice() should resolve to true after clicking continue");
  assert(mockLocalStorage.getItem('heybuddy.sandboxNoticeSeen.v1') === '1', "Should mark seen in localStorage after clicking continue");
  assert(mockDocument.body.children.length === 0, "Overlay should be removed from body");

  console.log("All tests completed successfully!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
