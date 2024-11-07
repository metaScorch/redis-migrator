import { createClient } from 'redis';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { source } = await request.json();

    // Validate required fields
    if (!source || !source.host || !source.port) {
      return NextResponse.json(
        { error: 'Missing required source configuration' },
        { status: 400 }
      );
    }

    // Create Redis client for source
    const sourceClient = createClient({
      url: `redis${source.tls ? 's' : ''}://${source.host}:${source.port}`,
      password: source.password,
    });

    // Connect to source Redis
    await sourceClient.connect();

    try {
      // Get total number of keys
      const totalKeys = await sourceClient.dbSize();

      await sourceClient.quit();

      return NextResponse.json({ totalKeys });
    } catch (error) {
      await sourceClient.quit();
      throw error;
    }
  } catch (error: any) {
    console.error('Error getting key count:', error);
    return NextResponse.json(
      { error: `Error getting key count: ${error.message}` },
      { status: 500 }
    );
  }
}