import { NextResponse } from 'next/server';
import { calculateVhrQuote, VHR_CATALOG, type VhrQuoteRequest } from '@/lib/satellite/vhr-pricing';

export async function GET() {
  return NextResponse.json({
    status: 'success',
    catalog: Object.values(VHR_CATALOG),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { providerId, areaKm2, orderType = 'archive', licensing = 'Single-User', priority = 'standard' } = body;

    if (!providerId || !areaKm2 || areaKm2 <= 0) {
      return NextResponse.json(
        { error: 'Valid providerId and positive areaKm2 required' },
        { status: 400 }
      );
    }

    const quote = calculateVhrQuote({
      providerId,
      areaKm2: Number(areaKm2),
      orderType,
      licensing,
      priority,
    });

    return NextResponse.json({
      status: 'success',
      quote,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate VHR quote' },
      { status: 500 }
    );
  }
}
