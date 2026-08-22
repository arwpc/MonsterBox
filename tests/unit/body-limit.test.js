/**
 * UP-10 — the JSON body limit was 50 MB.
 *
 * A single LAN POST could make the event loop of a 4-core Pi buffer and parse
 * 50 MB of JSON mid-show. The largest legitimate JSON body in the app is a
 * base64 TTS clip (a few MB even for a long monologue); real file uploads go
 * through multer's own multipart limits (audio 50 MB, video 500 MB, images
 * 10 MB) and are unaffected. The cap is now 10 MB — these tests pin both
 * sides: oversized is refused at the parser, realistic audio-sized bodies
 * still get through to the route.
 *
 * The probe endpoint validates input before acting, so neither request can
 * ever reach hardware: the oversized one dies in the parser, the accepted
 * one fails validation (no name/type).
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('JSON body limit (UP-10)', function () {
  this.timeout(30000);

  it('refuses an oversized JSON body with 413 before any route logic runs', async function () {
    const res = await request(BASE_URL)
      .post('/setup/calibration/api/parts')
      .send({ padding: 'x'.repeat(11 * 1024 * 1024) });
    expect(res.status, 'the parser must refuse, not buffer, an 11MB body').to.equal(413);
  });

  it('still accepts a realistic base64-audio-sized body (~3MB)', async function () {
    const res = await request(BASE_URL)
      .post('/setup/calibration/api/parts')
      .send({ padding: 'x'.repeat(3 * 1024 * 1024) });
    // 400 = the route's own validation (no name/type): the parser accepted
    // the body and handed it to the route — which is the claim under test.
    expect(res.status, 'a legitimate large audio payload must not be refused').to.equal(400);
  });
});
