import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, Check, Merge } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function EnrichmentMergePanel({ provider, npiValidation, onMergeComplete }) {
  const [selectedFields, setSelectedFields] = useState({});
  const [isMerging, setIsMerging] = useState(false);

  const fields = [
    { key: 'first_name', label: 'First Name', externalKey: 'first_name' },
    { key: 'last_name', label: 'Last Name', externalKey: 'last_name' },
    { key: 'organization_name', label: 'Organization Name', externalKey: 'organization_name' },
    { key: 'address_1', label: 'Address', externalKey: 'address' },
    { key: 'city', label: 'City', externalKey: 'city' },
    { key: 'state', label: 'State', externalKey: 'state' },
    { key: 'zip', label: 'Zip Code', externalKey: 'zip' },
    { key: 'phone', label: 'Phone', externalKey: 'phone' },
    { key: 'credential', label: 'Credential', externalKey: 'credentials', format: (v) => Array.isArray(v) ? v.join(', ') : v },
  ];

  // Identify discrepancies
  const discrepancies = fields.filter(field => {
    const currentVal = provider[field.key] || '';
    let externalVal = npiValidation[field.externalKey];
    
    if (field.format) externalVal = field.format(externalVal);
    
    // Normalize for comparison
    const normCurrent = String(currentVal).trim().toLowerCase();
    const normExternal = String(externalVal || '').trim().toLowerCase();

    return normExternal && normCurrent !== normExternal && normExternal !== 'undefined' && normExternal !== 'null';
  });

  const handleToggleField = (key) => {
    setSelectedFields(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      const updates = {};
      Object.entries(selectedFields).forEach(([key, isSelected]) => {
        if (isSelected) {
          const fieldConfig = fields.find(f => f.key === key);
          let value = npiValidation[fieldConfig.externalKey];
          if (fieldConfig.format) value = fieldConfig.format(value);
          updates[key] = value;
        }
      });

      if (Object.keys(updates).length === 0) {
        toast.info("No fields selected for merge");
        setIsMerging(false);
        return;
      }

      await base44.entities.Provider.update(provider.id, updates);
      
      toast.success(`Successfully merged ${Object.keys(updates).length} fields`);
      if (onMergeComplete) onMergeComplete();
      setSelectedFields({}); // Reset selection
    } catch (error) {
      console.error("Merge failed:", error);
      toast.error("Failed to merge provider data");
    } finally {
      setIsMerging(false);
    }
  };

  if (discrepancies.length === 0) {
    return (
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="pt-6 flex flex-col items-center justify-center text-center">
          <Check className="w-12 h-12 text-green-500 mb-2" />
          <h3 className="font-medium text-slate-900">Data is Synchronized</h3>
          <p className="text-sm text-slate-500 mt-1">Provider record matches NPI Registry data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Merge className="w-5 h-5 text-amber-600" />
          <CardTitle className="text-base text-slate-900">Data Comparison & Merge</CardTitle>
        </div>
        <CardDescription>
          Found {discrepancies.length} discrepancies between local record and NPI Registry. Select values to update.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[50px] text-center">Merge</TableHead>
                <TableHead>Field</TableHead>
                <TableHead className="text-slate-500">Current Value</TableHead>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead className="text-blue-600 font-medium">NPI Registry Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discrepancies.map((field) => {
                let externalVal = npiValidation[field.externalKey];
                if (field.format) externalVal = field.format(externalVal);
                const currentVal = provider[field.key] || <span className="text-slate-400 italic">Empty</span>;

                return (
                  <TableRow key={field.key} className={selectedFields[field.key] ? "bg-blue-50/50" : ""}>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={!!selectedFields[field.key]}
                        onCheckedChange={() => handleToggleField(field.key)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{field.label}</TableCell>
                    <TableCell className="text-sm text-slate-600">{currentVal}</TableCell>
                    <TableCell>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </TableCell>
                    <TableCell className="text-sm font-medium text-blue-700">
                      {externalVal || <span className="text-slate-400 italic">Empty</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between border-t border-amber-100 bg-amber-50/50 pt-4">
        <div className="text-xs text-slate-500">
          {Object.keys(selectedFields).filter(k => selectedFields[k]).length} fields selected
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedFields({})}>
            Clear Selection
          </Button>
          <Button 
            size="sm" 
            onClick={handleMerge} 
            disabled={isMerging || Object.keys(selectedFields).filter(k => selectedFields[k]).length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {isMerging ? "Merging..." : "Merge Selected"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}