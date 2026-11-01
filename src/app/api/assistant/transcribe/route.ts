import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_API_KEY';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('file') as Blob | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required for transcription' },
        { status: 400 }
      );
    }

    const groqForm = new FormData();
    groqForm.append('file', audioFile, 'audio.webm');
    groqForm.append('model', 'whisper-large-v3-turbo');
    groqForm.append('response_format', 'json');
    groqForm.append('temperature', '0.0');

    const groqRes = await fetch(GROQ_AUDIO_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: groqForm,
      signal: AbortSignal.timeout(15000),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.warn('[ORBINEX-Transcribe] Groq Whisper error:', groqRes.status, errText);
      return NextResponse.json(
        { error: 'Transcription service unavailable', details: errText },
        { status: groqRes.status }
      );
    }

    const data = await groqRes.json();
    return NextResponse.json({
      text: data.text?.trim() || '',
      success: true,
    });
  } catch (err: any) {
    console.error('[ORBINEX-Transcribe] Error:', err);
    return NextResponse.json(
      { error: 'Internal transcription error', details: err.message },
      { status: 500 }
    );
  }
}
