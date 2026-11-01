import { NextResponse } from 'next/server';
import { evaluateCommercialOrderSafety, type CommercialOrderRequest } from '@/lib/satellite/vhr-safety';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CommercialOrderRequest;

    const safetyResult = evaluateCommercialOrderSafety(body);

    if (safetyResult.status === 'HUMAN_CONFIRMATION_REQUIRED') {
      return NextResponse.json(safetyResult, { status: 403 });
    }

    if (safetyResult.status === 'INVALID_REQUEST') {
      return NextResponse.json(safetyResult, { status: 400 });
    }

    return NextResponse.json(safetyResult, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'Internal commercial order evaluation error',
      },
      { status: 500 }
    );
  }
}
