import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from 'lucide-react';

const typeColors = {
  info: 'text-gray-600',
  success: 'text-green-700',
  error: 'text-red-600',
};

export default function CrawlerLog({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Terminal className="w-5 h-5 text-gray-500" />
          Crawler Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 rounded-lg bg-gray-900 p-4 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-gray-500">No activity yet. Start the crawler to see logs here.</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-500 shrink-0">[{log.time}]</span>
                <span className={
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' :
                  'text-gray-300'
                }>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}