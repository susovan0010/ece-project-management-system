import { NextRequest, NextResponse } from 'next/server';
import { uploadStudentSubmissionAction, DocTypeValue } from '@/app/actions/submission';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const semesterRaw = Number(formData.get('semester'));
    const docType = formData.get('docType') as DocTypeValue;
    const file = formData.get('file') as File | null;

    if (![6, 7, 8].includes(semesterRaw)) {
      return NextResponse.json({ error: 'Invalid semester selected.' }, { status: 400 });
    }
    if (docType !== 'PROGRESS_REPORT' && docType !== 'PRESENTATION') {
      return NextResponse.json({ error: 'Invalid document type.' }, { status: 400 });
    }
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'Please select a non-empty file to upload.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'application/octet-stream';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const res = await uploadStudentSubmissionAction({
      semester: semesterRaw as 6 | 7 | 8,
      docType,
      fileName: file.name,
      mimeType,
      fileSize: file.size,
      dataUrlOrBase64: dataUrl,
    });

    if (res.error) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json(res, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: `Upload failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
