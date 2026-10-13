import React, { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function RadiusFilter({ zip, miles, onApply }) {
  const [draftZip, setDraftZip] = useState(zip);
  const [draftMiles, setDraftMiles] = useState(miles);
  const noteId = useId();
  useEffect(() => { setDraftZip(zip); setDraftMiles(miles); }, [zip, miles]);

  return (
    <div className="space-y-1.5">
      <form
        aria-label="ZIP radius filter"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onApply({ zip: draftZip.trim(), miles: draftMiles });
        }}
      >
        <Input
          aria-label="Radius ZIP code"
          aria-describedby={noteId}
          placeholder="ZIP code"
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          value={draftZip}
          onChange={(event) => setDraftZip(event.target.value)}
          className="w-32 bg-slate-800/50 border-slate-700/50 text-slate-200 placeholder:text-slate-400"
        />
        <Select value={draftMiles} onValueChange={setDraftMiles}>
          <SelectTrigger aria-label="Radius distance in miles" className="w-36 bg-slate-800/50 border-slate-700/50 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {[5, 10, 25, 50].map((distance) => (
              <SelectItem key={distance} value={String(distance)} className="text-slate-300">{distance} miles</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">Apply radius</Button>
        {zip ? (
          <Button type="button" variant="ghost" className="text-slate-300" onClick={() => onApply({ zip: '', miles: '25' })}>Clear radius</Button>
        ) : null}
      </form>
      <p id={noteId} className="text-xs text-slate-400">
        Approximate straight-line distance between Census ZIP-area centers. Locations without a known ZIP-area center are excluded.
      </p>
    </div>
  );
}
