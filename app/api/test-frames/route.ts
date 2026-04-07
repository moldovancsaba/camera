import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';

export async function GET() {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  const db = await connectToDatabase();
  const frames = await db.collection('frames').find({ isActive: true }).toArray();
  
  const serialized = frames.map(f => ({
    _id: f._id.toString(),
    frameId: f.frameId,
    name: f.name,
    hasFrameId: !!f.frameId,
  }));
  
  return NextResponse.json({
    count: frames.length,
    frames: serialized,
    raw: frames[0],
  });
}
