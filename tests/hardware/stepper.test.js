import { expect } from 'chai';
import { moveSteps, rotate, stop } from '../../services/hardwareService/stepper.js';

describe('Stepper Hardware Service', function () {
  this.timeout(5000);

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

