import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Sparkles, Brain, ChevronDown, ChevronUp, X } from 'lucide-react';

const confidenceBadge = (level) => {
  if (!level) return null;
  const config = {
    high: { label: 'Exact Match', className: 'bg-green-900/40 text-green-300 border-green-700' },
    learned: { label: 'Learned', className: 'bg-purple-900/40 text-purple-300 border-purple-700' },
    ai: { label: 'AI Suggested', className: 'bg-cyan-900/40 text-cyan-300 border-cyan-700' },
    medium: { label: 'Likely Match', className: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
    low: { label: 'Guess', className: 'bg-orange-900/40 text-orange-300 border-orange-700' },
  };
  const c = config[level];
  if (!c) return null;
  return (
    <Badge variant="outline" className={`text-[10px] ml-2 ${c.className}`}>
      {(level === 'ai' || level === 'learned') && <Sparkles className="w-2.5 h-2.5 mr-1" />}
      {c.label}
    </Badge>
  );
};

function MappingRow({ fieldName, isRequired, csvColumns, mapping, confidence, onChange, onClear }) {
  const currentValue = mapping[fieldName] || '';
  const conf = confidence?.[fieldName];

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center">
          <Label className="text-sm font-medium truncate">
            {fieldName}
          </Label>
          {isRequired && <span className="text-red-400 ml-1 flex-shrink-0">*</span>}
          {confidenceBadge(conf)}
        </div>
      </div>
      <div className="w-64 flex-shrink-0 flex items-center gap-1">
        <Select
          value={currentValue}
          onValueChange={(value) => onChange(fieldName, value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select column..." />
          </SelectTrigger>
          <SelectContent>
            {csvColumns.map(col => (
              <SelectItem key={col} value={col}>
                {col}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currentValue && !isRequired && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0 text-slate-500 hover:text-red-400"
            onClick={() => onClear(fieldName)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ColumnMapper({
  csvColumns,
  requiredColumns,
  optionalColumns = [],
  mapping,
  confidence = {},
  onChange,
  onFieldCorrected,
  aiLoading = false,
}) {
  const [showOptional, setShowOptional] = useState(false);

  const isMappingComplete = requiredColumns.every(col => mapping[col]);
  const mappedOptionalCount = optionalColumns.filter(col => mapping[col]).length;

  const handleMappingChange = (fieldName, csvCol) => {
    const newMapping = { ...mapping, [fieldName]: csvCol };
    onChange(newMapping);
    // Notify parent of user correction for learning
    if (onFieldCorrected) {
      onFieldCorrected(fieldName, csvCol);
    }
  };

  const handleClear = (fieldName) => {
    const newMapping = { ...mapping };
    delete newMapping[fieldName];
    onChange(newMapping);
  };

  return (
    <div className="space-y-4">
      {/* Required Columns */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <span>Required Fields</span>
              {aiLoading && (
                <Badge variant="outline" className="text-[10px] bg-cyan-900/30 text-cyan-300 border-cyan-700 animate-pulse">
                  <Brain className="w-2.5 h-2.5 mr-1" />
                  AI mapping...
                </Badge>
              )}
            </div>
            {isMappingComplete && (
              <Badge className="bg-green-900/40 text-green-300 border-green-700" variant="outline">
                <CheckCircle className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requiredColumns.map(col => (
            <MappingRow
              key={col}
              fieldName={col}
              isRequired={true}
              csvColumns={csvColumns}
              mapping={mapping}
              confidence={confidence}
              onChange={handleMappingChange}
              onClear={handleClear}
            />
          ))}
        </CardContent>
      </Card>

      {/* Optional Columns */}
      {optionalColumns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setShowOptional(!showOptional)}
            >
              <CardTitle className="text-base flex items-center gap-2">
                <span>Optional Fields</span>
                {mappedOptionalCount > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-slate-700 text-slate-300">
                    {mappedOptionalCount} mapped
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-xs">{optionalColumns.length} available</span>
                {showOptional ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
          </CardHeader>
          {showOptional && (
            <CardContent className="space-y-3 pt-0">
              <p className="text-xs text-slate-500 mb-2">
                These fields are optional but importing them will enrich your data. AI has suggested mappings where possible.
              </p>
              {optionalColumns.map(col => (
                <MappingRow
                  key={col}
                  fieldName={col}
                  isRequired={false}
                  csvColumns={csvColumns}
                  mapping={mapping}
                  confidence={confidence}
                  onChange={handleMappingChange}
                  onClear={handleClear}
                />
              ))}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}