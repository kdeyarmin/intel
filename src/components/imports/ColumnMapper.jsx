import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';

export default function ColumnMapper({ csvColumns, requiredColumns, mapping, onChange }) {
  const handleMappingChange = (requiredCol, csvCol) => {
    onChange({ ...mapping, [requiredCol]: csvCol });
  };

  const isMappingComplete = requiredColumns.every(col => mapping[col]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Map CSV Columns to Fields</span>
          {isMappingComplete && (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <CheckCircle className="w-3 h-3 mr-1" />
              Complete
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiredColumns.map(requiredCol => (
          <div key={requiredCol} className="space-y-2">
            <Label className="text-sm font-medium">
              {requiredCol}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Select
              value={mapping[requiredCol] || ''}
              onValueChange={(value) => handleMappingChange(requiredCol, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select CSV column..." />
              </SelectTrigger>
              <SelectContent>
                {csvColumns.map(col => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}