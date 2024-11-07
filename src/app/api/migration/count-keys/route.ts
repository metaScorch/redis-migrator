import { NextResponse } from 'next/server';
import Redis from 'ioredis';

export async function POST(request: Request) {
  try {
    const { source } = await request.json();
    
    const redis = new Redis({
      host: source.host,
      port: parseInt(source.port),
      password: source.password || undefined,
      tls: source.tls ? {} : undefined,
    });

    const keyCount = await redis.dbsize();
    await redis.quit();

    return NextResponse.json({ keyCount });
  } catch (error) {
    console.error('Redis error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to Redis' },
      { status: 500 }
    );
  }
}