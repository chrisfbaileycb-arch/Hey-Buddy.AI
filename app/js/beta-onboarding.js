/**
 * beta-onboarding.js — 3-Step Guided Onboarding Wizard for Hey Buddy Beta Testers
 *
 * Provides:
 *   1. First-run onboarding state persistence.
 *   2. Step navigation (Setup Mode -> Persona Choice -> Platform Tour).
 *   3. Smooth onboarding completion handler.
 */

import { UserPrefs } from '../../security/storage.js';

const ONBOARDING_PREF_KEY = 'hey_buddy_onboarding_completed_v1';

export async function shouldShowOnboarding() {
  const completed = await UserPrefs.get(ONBOARDING_PREF_KEY, false);
  return !completed;
}

export async function markOnboardingComplete() {
  await UserPrefs.set(ONBOARDING_PREF_KEY, true);
}

/**
 * Controller for managing the 3-step onboarding wizard.
 */
export class OnboardingWizard {
  constructor(domElements, callbacks = {}) {
    this.dom = domElements;
    this.callbacks = callbacks;
    this.currentStep = 1;
  }

  showStep(stepNum) {
    this.currentStep = stepNum;
    if (this.dom.step1) this.dom.step1.hidden = (stepNum !== 1);
    if (this.dom.step2) this.dom.step2.hidden = (stepNum !== 2);
    if (this.dom.step3) this.dom.step3.hidden = (stepNum !== 3);

    if (this.dom.stepIndicator) {
      this.dom.stepIndicator.textContent = `Step ${stepNum} of 3`;
    }
  }

  next() {
    if (this.currentStep < 3) {
      this.showStep(this.currentStep + 1);
    } else {
      this.finish();
    }
  }

  prev() {
    if (this.currentStep > 1) {
      this.showStep(this.currentStep - 1);
    }
  }

  async finish() {
    await markOnboardingComplete();
    if (this.callbacks.onComplete) {
      this.callbacks.onComplete();
    }
  }
}
