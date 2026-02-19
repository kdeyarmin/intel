import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ReferralVolumeChart({ data }) {
  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Referral Volume by Top Locations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
              <Legend />
              <Bar dataKey="home_health" fill="#14b8a6" radius={[0, 4, 4, 0]} name="Home Health" stackId="a" />
              <Bar dataKey="hospice" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Hospice" stackId="a" />
              <Bar dataKey="snf" fill="#f59e0b" radius={[0, 4, 4, 0]} name="SNF" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}