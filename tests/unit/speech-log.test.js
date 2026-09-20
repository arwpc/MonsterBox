/**
 * Speech log — the record behind the dashboard AI panel.
 *
 * The panel used to show only what the browser's own WebSocket session
 * produced, so anything the character said on its own (a PIR wake, lurk, a
 * scene's sayThis, an ask-ai fired from a phone) appeared nowhere. These tests
 * pin the behaviour the panel depends on: catch-up by seq, a bounded buffer,
 * per-character separation, and — most important — that a bad call can never
 * throw into a speech path.
 */

import { expect } from 'chai';
import { recordSpeech, speechSince, clearSpeech } from '../../services/speechLogService.js';

describe('speechLogService', () => {
    const CHAR = 9901;
    const OTHER = 9902;

    beforeEach(() => {
        clearSpeech(CHAR);
        clearSpeech(OTHER);
    });

    it('records a line and hands it back', () => {
        recordSpeech(CHAR, { speaker: 'character', source: 'scene', text: 'I remain available.' });
        const { entries } = speechSince(CHAR, 0);
        expect(entries).to.have.lengthOf(1);
        expect(entries[0].text).to.equal('I remain available.');
        expect(entries[0].speaker).to.equal('character');
        expect(entries[0].source).to.equal('scene');
        expect(entries[0].at).to.be.a('string');
    });

    it('returns only what the caller has not seen, by seq', () => {
        recordSpeech(CHAR, { text: 'first' });
        const first = speechSince(CHAR, 0);
        expect(first.entries.map(e => e.text)).to.deep.equal(['first']);

        recordSpeech(CHAR, { text: 'second' });
        const next = speechSince(CHAR, first.seq);
        expect(next.entries.map(e => e.text)).to.deep.equal(['second']);

        // Polling again with nothing new returns nothing — the panel must not
        // re-render lines it already shows.
        expect(speechSince(CHAR, next.seq).entries).to.have.lengthOf(0);
    });

    it('opens a fresh page with the recent tail rather than an empty panel', () => {
        recordSpeech(CHAR, { text: 'earlier line' });
        recordSpeech(CHAR, { text: 'later line' });
        const { entries } = speechSince(CHAR, 0);
        expect(entries.map(e => e.text)).to.deep.equal(['earlier line', 'later line']);
    });

    it('keeps characters apart', () => {
        recordSpeech(CHAR, { text: 'mine' });
        recordSpeech(OTHER, { text: 'theirs' });
        expect(speechSince(CHAR, 0).entries.map(e => e.text)).to.deep.equal(['mine']);
        expect(speechSince(OTHER, 0).entries.map(e => e.text)).to.deep.equal(['theirs']);
    });

    it('stays bounded — an unattended node cannot grow without end', () => {
        for (let i = 0; i < 400; i++) recordSpeech(CHAR, { text: `line ${i}` });
        const { entries, seq } = speechSince(CHAR, 0, 1000);
        expect(entries.length).to.be.at.most(300);
        // The newest line survives; the oldest is the one dropped.
        expect(entries[entries.length - 1].text).to.equal('line 399');
        expect(seq).to.equal(400);
    });

    it('ignores empty and whitespace-only text instead of logging blanks', () => {
        expect(recordSpeech(CHAR, { text: '' })).to.equal(null);
        expect(recordSpeech(CHAR, { text: '   ' })).to.equal(null);
        expect(recordSpeech(CHAR, {})).to.equal(null);
        expect(speechSince(CHAR, 0).entries).to.have.lengthOf(0);
    });

    it('never throws into a speech path, whatever it is handed', () => {
        // A logging fault must not interrupt a character mid-line in front of
        // guests, so every one of these has to return rather than throw.
        expect(() => recordSpeech(null, { text: 'x' })).to.not.throw();
        expect(() => recordSpeech(CHAR, null)).to.not.throw();
        expect(() => recordSpeech(CHAR, undefined)).to.not.throw();
        expect(() => recordSpeech(undefined, undefined)).to.not.throw();
        expect(() => speechSince(CHAR, 'not-a-number')).to.not.throw();
        expect(() => speechSince('never-seen-character', 0)).to.not.throw();
    });

    it('reports an unknown character as empty rather than failing', () => {
        const { entries, seq } = speechSince('no-such-character', 0);
        expect(entries).to.deep.equal([]);
        expect(seq).to.equal(0);
    });
});
