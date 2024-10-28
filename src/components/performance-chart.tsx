'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface PerformanceData {
  timestamp: number;
  speed: number;
  keysProcessed: number;
}

interface PerformanceChartProps {
  data: PerformanceData[];
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  return (
    <div className="w-full h-[300px]">
      <LineChart
        width={800}
        height={300}
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
        />
        <YAxis />
        <Tooltip
          labelFormatter={(timestamp) => new Date(timestamp).toLocaleTimeString()}
        />
        <Line
          type="monotone"
          dataKey="speed"
          name="Keys/Second"
          stroke="#8884d8"
        />
      </LineChart>
    </div>
  );
}