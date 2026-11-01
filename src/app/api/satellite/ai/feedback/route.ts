import { NextResponse } from 'next/server';
import { continuousLearningRegistry } from '@/lib/satellite/continuous-learning';

export async function GET() {
  const stats = await continuousLearningRegistry.getFeedbackStats();
  return NextResponse.json({
    status: 'success',
    stats,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      aoiBbox,
      predictedCategory = 'general_change',
      verification,
      confidenceScore = 0.9,
      correctedAreaKm2,
      analystNotes,
      modelIdentifier = 'ORBINEX-Specialist-v1',
    } = body;

    if (!aoiBbox || !verification) {
      return NextResponse.json(
        { error: 'aoiBbox and verification status required' },
        { status: 400 }
      );
    }

    const recorded = await continuousLearningRegistry.recordFeedback({
      aoiBbox,
      predictedCategory,
      verification,
      confidenceScore: Number(confidenceScore),
      correctedAreaKm2: correctedAreaKm2 ? Number(correctedAreaKm2) : undefined,
      analystNotes,
      modelIdentifier,
    });

    return NextResponse.json({
      status: 'success',
      feedback: recorded,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to record continuous learning feedback' },
      { status: 500 }
    );
  }
}
