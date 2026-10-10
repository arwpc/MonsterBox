// Fleet clock judgement (decision D8): a peer's /health plus the request timing → zone/NTP/sync/offset verdict.
import { expect } from 'chai';
import { clockFromHealth } from '../../services/clockStatus.js';

describe('clockFromHealth (fleet-health time block)', function () {
  const sent = 1_000_000, received = 1_000_400; // 400 ms round trip, midpoint 1_000_200

  it('is ok when zone, NTP and sync match and the offset is inside the limit', function () {
    const t = clockFromHealth({ time: '2026-10-10T18:00:00.000Z', epochMs: 1_000_900, clock: { zone: 'America/Chicago', ntp: true, synced: true } }, sent, received, 'America/Chicago', 2000);
    expect(t.offsetMs).to.equal(700);
    expect(t.ok).to.equal(true);
    expect(t.reported).to.equal(true);
    expect(t.problem).to.equal(null);
  });

  it('flags the wrong zone, NTP off, unsynchronized, and a large offset, all at once', function () {
    const t = clockFromHealth({ epochMs: 1_010_200, clock: { zone: 'Etc/UTC', ntp: false, synced: false } }, sent, received, 'America/Chicago', 2000);
    expect(t.ok).to.equal(false);
    expect(t.problem).to.include('zone Etc/UTC');
    expect(t.problem).to.include('NTP off');
    expect(t.problem).to.include('not synchronized');
    expect(t.problem).to.include('offset 10000 ms');
  });

  it('falls back to the ISO time when a build has no epochMs, and reports an absent clock block honestly', function () {
    const iso = new Date(1_000_200).toISOString();
    const t = clockFromHealth({ time: iso }, sent, received, 'America/Chicago', 2000);
    expect(t.offsetMs).to.equal(0);
    expect(t.reported).to.equal(false);   // zone/NTP unknown on an older build
    expect(t.zone).to.equal(null);
    expect(t.ok).to.equal(true);          // nothing proven wrong
  });

  it('returns null for no health body', function () {
    expect(clockFromHealth(null, sent, received)).to.equal(null);
  });
});
