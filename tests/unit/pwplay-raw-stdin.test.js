/**
 * pw-play raw-stdin flag — the conversation must be audible on PipeWire 1.4 nodes.
 *
 * Real-time conversation audio is headerless s16 PCM piped into a long-lived
 * pw-play. Bookworm's pw-play (PipeWire 1.2.x) has no `--raw` flag and plays
 * raw stdin as-is. PipeWire 1.4 (Debian 13, the Pi 5 node) hands stdin to
 * libsndfile unless `--raw` is given: "Format not recognised", exit, and every
 * chunk the conversation writes dies as EPIPE while writePcmStream reports
 * success. Found in Renfield's .err after his first conversation, three
 * re-spawns deep.
 *
 * The probe must agree with whatever pw-play THIS node has — with the flag
 * when the tool advertises it, without it when the tool would reject it — and
 * answer "no flag" when pw-play is absent entirely (CI). Node-agnostic by
 * construction: the expected value is read from the same tool.
 */
import { expect } from 'chai';
import { spawnSync } from 'child_process';
import playback from '../../services/serverPlaybackService.js';

function localPwPlayAdvertisesRaw() {
  try {
    const r = spawnSync('pw-play', ['--help'], { encoding: 'utf8', timeout: 3000 });
    return /--raw\b/.test(String(r.stdout || '') + String(r.stderr || ''));
  } catch (_) {
    return false;
  }
}

describe('pw-play raw-stdin flag', function () {
  this.timeout(10000);

  it("matches this node's pw-play: --raw when advertised, nothing otherwise", function () {
    const args = playback._pwplayRawArgs();
    expect(args).to.be.an('array');
    if (localPwPlayAdvertisesRaw()) {
      expect(args).to.deep.equal(['--raw']);
    } else {
      expect(args).to.deep.equal([]);
    }
  });

  it('probes once and then answers from memory', function () {
    const first = playback._pwplayRawArgs();
    expect(playback._pwplayRaw).to.be.a('boolean');
    // Force the cached answer and prove the second call trusts it.
    const remembered = playback._pwplayRaw;
    playback._pwplayRaw = !remembered;
    try {
      expect(playback._pwplayRawArgs()).to.deep.equal(!remembered ? ['--raw'] : []);
    } finally {
      playback._pwplayRaw = remembered;
    }
    expect(playback._pwplayRawArgs()).to.deep.equal(first);
  });

  it('never emits the flag ahead of the stream options in a shape pw-play rejects', function () {
    // The flag goes FIRST; --format/--rate/--channels follow. pw-play parses
    // options in any order, but `-` (stdin) must stay last — assert the helper
    // returns only flags, never a positional.
    for (const arg of playback._pwplayRawArgs()) {
      expect(arg).to.match(/^--/);
    }
  });
});
