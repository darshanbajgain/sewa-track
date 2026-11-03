import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { DEMO, kathmanduWardId, resetRequests, sessionFor } from './helpers.js';

/**
 * Supporting documents (PRD F15), against the real test database.
 * Files are tiny fakes: only their first bytes matter for the type check.
 */
const app = createApp();
const as: Record<string, string> = {};

const PDF = Buffer.from('%PDF-1.4 demo file');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('demo')]);
const EXE_AS_PNG = Buffer.from('MZ this is really a program');
const BIRTH_CERT = 'Birth registration certificate'; // in DATE_OF_BIRTH's list of required documents

beforeAll(async () => {
  await resetRequests();
  for (const [key, email] of Object.entries(DEMO)) as[key] = await sessionFor(email);
});
afterAll(() => closePool());

async function newRequest(serviceTypeCode = 'DATE_OF_BIRTH', who = 'citizen'): Promise<string> {
  const res = await request(app)
    .post('/api/v1/requests')
    .set('Cookie', as[who]!)
    .send({
      serviceTypeCode,
      wardId: await kathmanduWardId(1),
      purpose: 'Needed for an official purpose',
      applicant: { name: 'Demo Applicant', nid: 'DEMO-3333333' },
      consent: true,
    });
  return res.body.request.id;
}

const move = (who: string, id: string, body: object) =>
  request(app).post(`/api/v1/requests/${id}/transitions`).set('Cookie', as[who]!).send(body);
const add = (who: string, id: string, name: string, file: Buffer, fileName = 'scan.pdf') =>
  request(app).post(`/api/v1/requests/${id}/documents`).set('Cookie', as[who]!).field('name', name).attach('file', file, fileName);
const put = (who: string, id: string, docId: string, file: Buffer, fileName = 'scan.pdf') =>
  request(app).put(`/api/v1/requests/${id}/documents/${docId}/file`).set('Cookie', as[who]!).attach('file', file, fileName);
const review = (who: string, id: string, docId: string, body: object) =>
  request(app).post(`/api/v1/requests/${id}/documents/${docId}/review`).set('Cookie', as[who]!).send(body);
const detail = async (who: string, id: string) => (await request(app).get(`/api/v1/requests/${id}`).set('Cookie', as[who]!)).body.request;

async function documentEvents(id: string) {
  const { rows } = await pool.query(
    `SELECT action, note FROM request_events WHERE request_id = $1 AND action LIKE 'DOCUMENT_%' ORDER BY id`,
    [id],
  );
  return rows;
}

/** Officer starts the review, then asks for these documents. Returns the version after both moves. */
async function askFor(id: string, documents: string[]) {
  await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 });
  const res = await move('officerWard1', id, { toStatus: 'NEEDS_DOCUMENTS', version: 1, note: 'Please upload these', documents });
  expect(res.status).toBe(200);
  return (await detail('citizen', id)).documents as { id: string; name: string; status: string }[];
}

describe('citizen adds a listed document (e.g. at apply time)', () => {
  it('201 with the document, stored with the real type and a clean name, audited', async () => {
    const id = await newRequest();
    const res = await add('citizen', id, BIRTH_CERT, PNG, '../my scan.PDF');

    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({
      name: BIRTH_CERT,
      status: 'UPLOADED',
      requestedByOfficer: false,
      file: { name: 'my scan.png', contentType: 'image/png', sizeBytes: PNG.length },
    });
    expect(await documentEvents(id)).toEqual([{ action: 'DOCUMENT_UPLOADED', note: BIRTH_CERT }]);
  });

  it('accepts the Nepali name and stores the English one; refuses a name not in the list and a duplicate', async () => {
    const id = await newRequest();
    expect((await add('citizen', id, 'जन्मदर्ता प्रमाणपत्र', PDF)).body.document.name).toBe(BIRTH_CERT);
    expect((await add('citizen', id, BIRTH_CERT, PDF)).status).toBe(409);
    expect((await add('citizen', id, 'My own document', PDF)).status).toBe(400);
  });
});

describe('file checks (400, nothing saved)', () => {
  it('refuses a renamed .exe, an empty or missing file, and a file over 2 MB', async () => {
    const id = await newRequest();
    const exe = await add('citizen', id, BIRTH_CERT, EXE_AS_PNG, 'photo.png');
    expect(exe.status).toBe(400);
    expect(exe.body.error.message).toBe('Only JPEG, PNG or PDF files are accepted');

    const tooBig = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024 + 1 - PDF.length)]);
    const big = await add('citizen', id, BIRTH_CERT, tooBig);
    expect(big.status).toBe(400);
    expect(big.body.error.message).toBe('The file is larger than 2 MB');

    const none = await request(app).post(`/api/v1/requests/${id}/documents`).set('Cookie', as.citizen!).field('name', BIRTH_CERT);
    expect(none.status).toBe(400);

    expect((await detail('citizen', id)).documents).toEqual([]);
    expect(await documentEvents(id)).toEqual([]);
  });

  it('accepts exactly 2 MB', async () => {
    const id = await newRequest();
    const exactly = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024 - PDF.length)]);
    expect((await add('citizen', id, BIRTH_CERT, exactly)).status).toBe(201);
  });
});

describe('officer asks for documents → citizen uploads → officer reviews', () => {
  it('runs the whole flow, with an audit event for every step', async () => {
    const id = await newRequest();
    const docs = await askFor(id, [BIRTH_CERT, 'Hospital birth record']);
    expect(docs.map((d) => [d.name, d.status])).toEqual([
      [BIRTH_CERT, 'REQUESTED'],
      ['Hospital birth record', 'REQUESTED'],
    ]);

    // One missing → resubmit refused.
    await put('citizen', id, docs[0]!.id, PDF);
    expect((await move('citizen', id, { toStatus: 'UNDER_REVIEW', version: 2, note: 'Added' })).status).toBe(422);

    // Officer marks the first "not OK" while the second is still missing.
    const notOk = await review('officerWard1', id, docs[0]!.id, { decision: 'REJECTED', note: 'The scan is blurry' });
    expect(notOk.body.document).toMatchObject({ status: 'REJECTED', reviewNote: 'The scan is blurry' });

    // Citizen uploads both; the re-upload clears the old review.
    const again = await put('citizen', id, docs[0]!.id, PNG, 'clear.png');
    expect(again.body.document).toMatchObject({ status: 'UPLOADED', reviewNote: null, file: { name: 'clear.png' } });
    await put('citizen', id, docs[1]!.id, PDF);
    expect((await move('citizen', id, { toStatus: 'UNDER_REVIEW', version: 2, note: 'Added both' })).status).toBe(200);

    expect((await review('officerWard1', id, docs[0]!.id, { decision: 'ACCEPTED' })).body.document.status).toBe('ACCEPTED');
    // An accepted document can't be replaced.
    expect((await put('citizen', id, docs[0]!.id, PDF)).status).toBe(422);

    expect(await documentEvents(id)).toEqual([
      { action: 'DOCUMENT_UPLOADED', note: BIRTH_CERT },
      { action: 'DOCUMENT_REVIEWED', note: `${BIRTH_CERT} (not OK: The scan is blurry)` },
      { action: 'DOCUMENT_UPLOADED', note: BIRTH_CERT },
      { action: 'DOCUMENT_UPLOADED', note: 'Hospital birth record' },
      { action: 'DOCUMENT_REVIEWED', note: `${BIRTH_CERT} (accepted)` },
    ]);
  });

  it('asking again for a document resets it to REQUESTED (old file cleared)', async () => {
    const id = await newRequest();
    await add('citizen', id, BIRTH_CERT, PDF);
    const docs = await askFor(id, [BIRTH_CERT]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ status: 'REQUESTED', file: null });
  });

  it('400 without document names; nothing changes', async () => {
    const id = await newRequest();
    await move('officerWard1', id, { toStatus: 'UNDER_REVIEW', version: 0 });
    for (const documents of [undefined, [], ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => `Doc ${x}`), ['Same doc', 'same doc']]) {
      const res = await move('officerWard1', id, { toStatus: 'NEEDS_DOCUMENTS', version: 1, note: 'Upload', documents });
      expect(res.status).toBe(400);
    }
    expect((await detail('officerWard1', id)).status).toBe('UNDER_REVIEW');
  });

  it('at most 10 documents per request', async () => {
    const id = await newRequest();
    await askFor(id, ['Doc 1', 'Doc 2', 'Doc 3', 'Doc 4', 'Doc 5']);
    const { rows } = await pool.query(`SELECT id FROM request_documents WHERE request_id = $1`, [id]);
    for (const r of rows) await put('citizen', id, r.id, PDF);
    await move('citizen', id, { toStatus: 'UNDER_REVIEW', version: 2, note: 'All five' });
    expect((await move('officerWard1', id, { toStatus: 'NEEDS_DOCUMENTS', version: 3, note: 'More', documents: ['Doc 6', 'Doc 7', 'Doc 8', 'Doc 9', 'Doc 10'] })).status).toBe(200);
    // The request now has 10 documents: one more is refused.
    const eleventh = await add('citizen', id, BIRTH_CERT, PDF);
    expect(eleventh.status).toBe(400);
    expect(eleventh.body.error.message).toBe('A request can have at most 10 documents');
  });
});

describe('who may do what (scope and role)', () => {
  it('another citizen or another ward → 403; staff can not upload; citizen can not review', async () => {
    const id = await newRequest();
    const docs = await askFor(id, [BIRTH_CERT]);
    await put('citizen', id, docs[0]!.id, PDF);

    // A second citizen (signs up through the real endpoint; test-* emails are cleaned up by accounts.test.ts).
    await pool.query(`DELETE FROM users WHERE email = 'test-docs-other@example.com'`);
    const signup = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Other Demo Citizen', email: 'test-docs-other@example.com', password: 'demo12345' });
    expect(signup.status).toBe(201);
    const otherCitizen = await sessionFor('test-docs-other@example.com');
    const download = (cookie: string) => request(app).get(`/api/v1/requests/${id}/documents/${docs[0]!.id}/file`).set('Cookie', cookie);

    expect((await download(otherCitizen)).status).toBe(403);
    expect((await download(as.officerWard2!)).status).toBe(403);
    expect((await review('officerWard2', id, docs[0]!.id, { decision: 'ACCEPTED' })).status).toBe(403);
    expect((await put('officerWard1', id, docs[0]!.id, PDF)).status).toBe(403);
    expect((await review('citizen', id, docs[0]!.id, { decision: 'ACCEPTED' })).status).toBe(403);
    expect((await review('palikaAdmin', id, docs[0]!.id, { decision: 'ACCEPTED' })).status).toBe(403);
    // Not logged in: refused before the file is even read.
    expect((await request(app).put(`/api/v1/requests/${id}/documents/${docs[0]!.id}/file`).attach('file', PDF, 'a.pdf')).status).toBe(401);
  });

  it('a document id only works through its own request (404 otherwise)', async () => {
    const a = await newRequest();
    const b = await newRequest();
    const docs = await askFor(a, [BIRTH_CERT]);
    expect((await put('citizen', b, docs[0]!.id, PDF)).status).toBe(404);
    expect((await request(app).get(`/api/v1/requests/${b}/documents/${docs[0]!.id}/file`).set('Cookie', as.citizen!)).status).toBe(404);
  });

  it('"not OK" needs a reason; a requested document without a file can not be reviewed', async () => {
    const id = await newRequest();
    const docs = await askFor(id, [BIRTH_CERT]);
    expect((await review('officerWard1', id, docs[0]!.id, { decision: 'ACCEPTED' })).status).toBe(422);
    await put('citizen', id, docs[0]!.id, PDF);
    expect((await review('officerWard1', id, docs[0]!.id, { decision: 'REJECTED' })).status).toBe(400);
  });
});

describe('download', () => {
  it('owner and scoped staff (officer, palika, system admin) get the file with safe headers', async () => {
    const id = await newRequest();
    const doc = (await add('citizen', id, BIRTH_CERT, PDF, 'जन्मदर्ता.pdf')).body.document;

    for (const who of ['citizen', 'officerWard1', 'palikaAdmin', 'systemAdmin']) {
      const res = await request(app)
        .get(`/api/v1/requests/${id}/documents/${doc.id}/file`)
        .set('Cookie', as[who]!)
        .buffer(true)
        .parse((r, done) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => done(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body, PDF)).toBe(0);
      expect(res.headers).toMatchObject({
        'content-type': 'application/pdf',
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent('जन्मदर्ता.pdf')}`,
      });
      expect(res.headers['content-security-policy']).toMatch(/^sandbox/);
    }
  });

  it('public tracking shows no documents', async () => {
    const id = await newRequest();
    await add('citizen', id, BIRTH_CERT, PDF);
    const code = (await detail('citizen', id)).trackingCode;
    const res = await request(app).get(`/api/v1/track/${code}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/document|Birth registration|%PDF/i);
  });
});

describe('detail page flags', () => {
  it('tells the owner they can upload and the ward officer they can review; admins neither', async () => {
    const id = await newRequest();
    expect(await detail('citizen', id)).toMatchObject({ canUploadDocuments: true, canReviewDocuments: false });
    expect(await detail('officerWard1', id)).toMatchObject({ canUploadDocuments: false, canReviewDocuments: true });
    expect(await detail('palikaAdmin', id)).toMatchObject({ canUploadDocuments: false, canReviewDocuments: false });
  });
});
