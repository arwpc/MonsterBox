/**
 * LED Interaction States — reflects the AI conversation lifecycle on a
 * character's LED eye ring so onlookers can read what the animatronic is doing:
 *
 *   idle       — nothing happening (resting look)
 *   listening  — waiting for the person to speak (their cue to answer)
 *   thinking   — processing / generating a reply
 *   speaking   — talking (this state is driven audio-reactively by
 *                services/ledSpeakingSync.js during playback, not here)
 *
 * These map to the per-state colours configured on /setup/led-animation, so the
 * operator controls exactly what each state looks like. This module only drives
 * the non-speaking states; speaking is owned by the audio-reactive path.
 *
 * Thin, error-swallowing wrapper over ledController.setState. It is a NO-OP for
 * any character without an led_ring, so every AI code path can call it
 * unconditionally — it works alongside jaw animation and on any character, and
 * does nothing where there is no ring.
 */

const NON_SPEAKING_STATES = new Set(['idle', 'listening', 'thinking', 'error', 'off']);

/**
 * Drive the ring to a conversation state. Returns true if the ring accepted it.
 * @param {string|number} characterId
 * @param {'idle'|'listening'|'thinking'|'error'|'off'} state
 */
async function setInteractionState(characterId, state) {
  if (!NON_SPEAKING_STATES.has(state)) return false;   // 'speaking' is not ours to set
  if (characterId == null) return false;
  try {
    // Only participate in the AI interaction when the operator has turned LED
    // sync on for this character — same gate as the audio-reactive speaking, so
    // the eyes are either fully in the conversation or not at all. (No jaw servo
    // required; this is independent of the jaw.)
    const jaw = await import('./jawAnimationSuperPowerService.js')
      .then((m) => m.readJawConfig(characterId)).catch(() => null);
    if (!jaw || !jaw.ledSync || !jaw.ledSync.enabled) return false;

    const { default: ledController } = await import('./ledController.js');
    if (state === 'off') {
      const r = await ledController.off();
      return !!(r && r.success);
    }
    const result = await ledController.setState(state, { characterId: Number(characterId) });
    return !!(result && result.success);
  } catch (_) {
    // Never let an eye update disturb the conversation.
    return false;
  }
}

export default { setInteractionState };
