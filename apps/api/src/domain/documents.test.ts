import { describe, expect, it } from 'vitest';
import { checkReview, checkUpload, cleanFileName, detectFileType } from './documents.js';

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);

describe('detectFileType: the real type, from the first bytes', () => {
  it('recognises PDF, PNG and JPEG', () => {
    expect(detectFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('application/pdf'); // %PDF-
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });

  it('refuses anything else, whatever its name says (exe, HTML, GIF, empty)', () => {
    expect(detectFileType(bytes(0x4d, 0x5a))).toBeNull(); // "MZ" = Windows .exe
    expect(detectFileType(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectFileType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe('cleanFileName', () => {
  it('drops folders and odd characters, keeps Nepali letters, and uses the real extension', () => {
    expect(cleanFileName('../../etc/passwd.png', 'application/pdf')).toBe('passwd.pdf');
    expect(cleanFileName('C:\\Users\\me\\जन्मदर्ता.JPG', 'image/jpeg')).toBe('जन्मदर्ता.jpg');
    expect(cleanFileName('a<b>"c".png', 'image/png')).toBe('a_b_c_.png');
  });

  it('falls back to "document" and keeps names short', () => {
    expect(cleanFileName('.png', 'image/png')).toBe('document.png');
    expect(cleanFileName(`${'x'.repeat(300)}.pdf`, 'application/pdf')).toHaveLength(104);
  });
});

describe('checkUpload', () => {
  it('lets the citizen upload while the request is being worked on', () => {
    for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'FIELD_VERIFICATION'] as const) {
      expect(checkUpload(status, null, 'CITIZEN')).toEqual({ ok: true });
      expect(checkUpload(status, 'REJECTED', 'CITIZEN')).toEqual({ ok: true });
    }
  });

  it('refuses after approval, on closed requests, and for an accepted document', () => {
    for (const status of ['APPROVED', 'ISSUED', 'REJECTED', 'CANCELLED'] as const) {
      expect(checkUpload(status, 'REQUESTED', 'CITIZEN')).toMatchObject({ code: 'INVALID_TRANSITION' });
    }
    expect(checkUpload('UNDER_REVIEW', 'ACCEPTED', 'CITIZEN')).toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('refuses every staff role', () => {
    for (const role of ['WARD_OFFICER', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'] as const) {
      expect(checkUpload('UNDER_REVIEW', 'REQUESTED', role)).toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});

describe('checkReview', () => {
  it('lets the ward officer review an uploaded file while the request is open', () => {
    expect(checkReview('UNDER_REVIEW', 'UPLOADED', 'WARD_OFFICER')).toEqual({ ok: true });
    expect(checkReview('APPROVED', 'ACCEPTED', 'WARD_OFFICER')).toEqual({ ok: true });
  });

  it('refuses a document without a file, a closed request, and read-only roles', () => {
    expect(checkReview('UNDER_REVIEW', 'REQUESTED', 'WARD_OFFICER')).toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(checkReview('ISSUED', 'UPLOADED', 'WARD_OFFICER')).toMatchObject({ code: 'INVALID_TRANSITION' });
    for (const role of ['CITIZEN', 'PALIKA_ADMIN', 'SYSTEM_ADMIN'] as const) {
      expect(checkReview('UNDER_REVIEW', 'UPLOADED', role)).toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});
