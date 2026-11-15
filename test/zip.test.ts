import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { createZipBuffer } from '@/lib/zip';
import { buildForumArchiveZipBuffer } from '@/lib/engine/forum-archive-generator';

function parseZipEntries(zipBuf: Buffer): Array<{ name: string; content: Buffer }> {
  const results: Array<{ name: string; content: Buffer }> = [];
  let offset = 0;

  while (offset + 30 <= zipBuf.length) {
    const sig = zipBuf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const method = zipBuf.readUInt16LE(offset + 8);
    const compSize = zipBuf.readUInt32LE(offset + 18);
    const nameLen = zipBuf.readUInt16LE(offset + 26);
    const extraLen = zipBuf.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = zipBuf.subarray(nameStart, nameStart + nameLen).toString('utf-8');
    const dataStart = nameStart + nameLen + extraLen;
    const compressedData = zipBuf.subarray(dataStart, dataStart + compSize);

    const content = method === 8 ? zlib.inflateRawSync(compressedData) : compressedData;
    results.push({ name, content });

    offset = dataStart + compSize;
  }

  return results;
}

describe('ZIP Builder & Forum Archive Generator', () => {
  it('creates a valid PKZIP archive with deflated entries that round-trip cleanly', () => {
    const sampleText = 'ECE Capstone Project Management System '.repeat(20);
    const binaryPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'utf-8');

    const zipBuf = createZipBuffer([
      { name: 'docs/readme.txt', data: sampleText },
      { name: 'files/report.pdf', data: binaryPdf },
    ]);

    expect(zipBuf.readUInt32LE(0)).toBe(0x04034b50); // Local header signature
    const parsed = parseZipEntries(zipBuf);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('docs/readme.txt');
    expect(parsed[0].content.toString('utf-8')).toBe(sampleText);
    expect(parsed[1].name).toBe('files/report.pdf');
    expect(parsed[1].content.equals(binaryPdf)).toBe(true);
  });

  it('bundles forum communications JSON, HTML transcript, and base64 attachments into a ZIP', async () => {
    const fakePngBase64 = Buffer.from('PNG_IMAGE_BYTES_12345').toString('base64');
    const fakePdfBase64 = Buffer.from('%PDF-1.4\nSample PDF Content').toString('base64');

    const res = await buildForumArchiveZipBuffer({
      batchId: '2023-2027',
      archivedAt: '15 November 2026',
      archivedByAdmin: 'Admin User',
      posts: [
        {
          id: 'post-abcdef',
          groupId: 'grp-1',
          channel: 'GROUP',
          title: 'Initial Circuit Schematic',
          content: 'Attached schematic image for review.',
          createdAt: new Date('2026-10-01T10:00:00Z'),
          group: { number: 1, topic: { code: 'ECE-01', title: 'VLSI Filter' } },
          author: {
            id: 'stu-u1',
            name: 'Ananya Sen',
            email: 'ananya@hitk.edu',
            role: 'STUDENT',
            student: { roll: '2355001', universityRoll: '12600323001' },
          },
          attachments: [
            {
              name: 'schematic.png',
              type: 'image/png',
              size: 21,
              url: `data:image/png;base64,${fakePngBase64}`,
            },
          ],
          reactions: [{ userId: 'fac-1', type: 'LIKE' }],
          markupVotes: [{ value: 1, reason: 'Good schematic', supervisor: { name: 'Prof. Roy' } }],
          replies: [
            {
              id: 'rep-123456',
              content: 'Please see the annotated PDF.',
              createdAt: new Date('2026-10-02T12:00:00Z'),
              author: {
                id: 'fac-1',
                name: 'Prof. Roy',
                email: 'roy@hitk.edu',
                role: 'FACULTY',
              },
              attachments: [
                {
                  name: 'review_notes.pdf',
                  type: 'application/pdf',
                  size: 27,
                  url: `data:application/pdf;base64,${fakePdfBase64}`,
                },
              ],
              reactions: [],
              markupVotes: [],
            },
          ],
        },
      ],
    });

    expect(res.postsCount).toBe(1);
    expect(res.repliesCount).toBe(1);
    expect(res.attachmentsArchivedCount).toBe(2);

    const parsed = parseZipEntries(res.zipBuffer);
    const names = parsed.map((e) => e.name);
    expect(names).toContain('forum_communications.json');
    expect(names).toContain('forum_communications.html');
    expect(names).toContain('attachments/Group_1/post_abcdef_schematic.png');
    expect(names).toContain('attachments/Group_1/reply_123456_review_notes.pdf');

    const jsonEntry = JSON.parse(
      parsed.find((e) => e.name === 'forum_communications.json')!.content.toString('utf-8')
    );
    expect(jsonEntry.posts[0].author.collegeRoll).toBe('2355001');
    expect(jsonEntry.posts[0].author.universityRoll).toBe('12600323001');
    expect(jsonEntry.posts[0].replies[0].attachments[0].status).toBe('BUNDLED_IN_ZIP');
  });
});
