import { expect } from 'chai';
import fs from 'fs/promises';
import { moveSteps, rotate, stop } from '../../services/hardwareService/stepper.js';
import { readConfig } from '../../services/configService.js';

describe('Stepper Hardware Service', function () {
  this.timeout(5000);

  before(async function () {
    // GPIO 23/24 below are RAW pins, not a part lookup. On a character whose
    // real hardware already claims one of them (Orlok: GPIO 23 is the right
    // arm's MDD10A direction pin) this suite collides with live wiring and
    // fails with 'GPIO busy'. Only run where the character actually defines a
    // stepper part — same rule the other hardware suites follow.
    try {
      const cfg = await readConfig();
      const parts = JSON.parse(await fs.readFile(
        `data/character-${cfg.selectedCharacter}/parts.json`, 'utf8'));
      if (!parts.some(p => p.type === 'stepper')) this.skip();
    } catch (_) {
      this.skip();
    }
  });

  it('moveSteps should return success JSON', async () => {
    const out = await moveSteps({ stepPin: 23, dirPin: 24, direction: 'cw', steps: 200, stepDelayUs: 800 });
    expect(typeof out).to.equal('string');
    expect(out).to.include('success');
    expect(out).to.include('move_steps');
  });

  it('rotate should return success JSON', async () => {
    const out = await rotate({ stepPin: 23, dirPin: 24, direction: 'ccw', revolutions: 0.5, microstepping: 16, rpm: 120 });
    expect(typeof out).to.equal('string');
    expect(out).to.include('success');
    expect(out).to.satisfy((s) => s.includes('rotate') || s.includes('move_steps'));
  });

  it('stop should return success JSON', async () => {
    const out = await stop();
    expect(typeof out).to.equal('string');
    expect(out).to.include('success');
    expect(out).to.include('stop');
  });
});

