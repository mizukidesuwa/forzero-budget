// @ts-check
import { setText } from './language.js';

/** @typedef {{mode: 'courier' | 'shadow-chase' | 'online-chase', title: string, detail: string}} HudActivity */
/** @typedef {{mode: 'paused' | 'count' | 'race' | 'done', title: string, value: string, detail?: string, action?: string, large?: boolean, review?: boolean}} HudCallout */
/** @typedef {{text: string, tone: 'info' | 'success' | 'warning'}} HudNotice */
/** @typedef {{text: string, tone: '' | 'even' | 'ahead' | 'behind'}} HudCheckpoint */
/**
 * @typedef {object} SceneHudState
 * @property {{mode: 'timed'} | HudActivity | null} panel
 * @property {string} route
 * @property {string} warning
 * @property {HudCheckpoint | null} checkpoint
 * @property {boolean} checkpointPulse
 * @property {HudNotice | null} blind
 * @property {HudCallout | null} callout
 */

/** @param {Record<string, HTMLElement>} ui */
export function createSceneHud(ui) {
  let mapOpen = false;
  /** @type {HudCallout | null} */
  let callout = null;

  function syncCalloutVisibility() {
    ui.callout.hidden = mapOpen || !callout;
  }

  /** @param {HTMLElement} element @param {string} text */
  function showText(element, text) {
    element.hidden = !text;
    setText(element, text);
  }

  return {
    /** @param {boolean} open */
    setMapOpen(open) {
      mapOpen = open;
      syncCalloutVisibility();
    },
    /** @param {SceneHudState} view */
    render({ panel, route, warning, checkpoint, checkpointPulse, blind, callout: currentCallout }) {
      const timed = panel?.mode === 'timed';
      const activity = panel?.mode !== 'timed' ? panel : null;
      ui.timing.hidden = !timed;
      ui.timing.classList.toggle('gate-pop', timed && checkpointPulse);
      ui.activityHud.hidden = !activity;
      if (activity) ui.activityHud.dataset.mode = activity.mode;
      else delete ui.activityHud.dataset.mode;
      setText(ui.activityTitle, activity?.title ?? '');
      setText(ui.activityDetail, activity?.detail ?? '');

      showText(ui.next, route);
      showText(ui.routeWarning, warning);
      showText(ui.gateFlash, checkpoint?.text ?? '');
      if (checkpoint) ui.gateFlash.dataset.gap = checkpoint.tone;
      else delete ui.gateFlash.dataset.gap;
      showText(ui.blindHint, blind?.text ?? '');
      if (blind) ui.blindHint.dataset.tone = blind.tone;
      else delete ui.blindHint.dataset.tone;
      ui.miniButton.hidden = Boolean(blind);
      ui.touchBell.hidden = !blind;

      callout = currentCallout;
      syncCalloutVisibility();
      const review = Boolean(callout?.review);
      ui.raceReview.hidden = !review;
      ui.callout.classList.toggle('has-review', review);
      if (callout) ui.callout.dataset.mode = callout.mode;
      else delete ui.callout.dataset.mode;
      setText(ui.callTitle, callout?.title ?? '');
      setText(ui.callValue, callout?.value ?? '');
      ui.callValue.classList.toggle('count-number', Boolean(callout?.large));
      showText(ui.callDetail, callout?.detail ?? '');
      showText(ui.callAction, callout?.action ?? '');
    },
  };
}
