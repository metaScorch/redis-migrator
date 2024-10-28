// src/app/api/migration/events/route.ts
import { migrator } from '@/lib/migration-store';

interface EventData {
  type: 'progress' | 'keyProcessed' | 'error';
  processed?: number;
  total?: number;
  percent?: number;
  keysPerSecond?: number;
  key?: string;
  operation?: string;
  message?: string;
}

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: EventData) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const handlers = {
        progress: (stats: {
          processed: number;
          total: number;
          percent: number;
          keysPerSecond: number;
        }) => {
          send({
            type: 'progress',
            ...stats
          });
        },
        keyProcessed: (data: {
          key: string;
          operation: string;
        }) => {
          send({
            type: 'keyProcessed',
            ...data
          });
        },
        error: (error: Error) => {
          send({
            type: 'error',
            message: error.message
          });
        }
      };

      // Set up event handlers
      if (migrator) {
        migrator.on('progress', handlers.progress);
        migrator.on('keyProcessed', handlers.keyProcessed);
        migrator.on('error', handlers.error);

        // Clean up handlers when the stream closes
        return () => {
          migrator?.removeListener('progress', handlers.progress);
          migrator?.removeListener('keyProcessed', handlers.keyProcessed);
          migrator?.removeListener('error', handlers.error);
        };
      }
    },
    cancel() {
      // Handle client disconnect
      console.log('Client disconnected from SSE');
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
