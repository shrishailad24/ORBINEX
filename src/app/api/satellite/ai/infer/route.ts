import { NextResponse } from 'next/server';
import { runSpecialistInference } from '@/lib/satellite/ai/unified-engine';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { beforePath, afterPath, areaKm2 = 100.0, bbox = [0, 0, 1, 1] } = body;

    if (!beforePath || !afterPath) {
      return NextResponse.json(
        { error: 'beforePath and afterPath are required' },
        { status: 400 }
      );
    }

    const result = await runSpecialistInference({
      beforePathOrUrl: beforePath,
      afterPathOrUrl: afterPath,
      areaKm2: Number(areaKm2),
      bbox,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Specialist AI inference failed' },
      { status: 500 }
    );
  }
}
