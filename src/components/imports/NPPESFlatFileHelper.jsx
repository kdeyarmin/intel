import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Terminal, AlertTriangle, Download, FileText, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function NPPESFlatFileHelper() {
  const [copied, setCopied] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamResult, setStreamResult] = useState('');
  
  const startStream = async () => {
    if (!streamUrl) return toast.error('Please enter a valid CSV URL');
    setStreaming(true);
    setStreamResult('Initializing...');
    
    try {
      const { base44 } = await import('@/api/base44Client');
      const batch = await base44.entities.ImportBatch.create({
        import_type: 'nppes_registry',
        file_name: 'Distributed Stream',
        file_url: streamUrl,
        status: 'processing',
        dry_run: false,
        column_mapping: {
            'NPI': 'NPI',
            'Entity Type Code': 'Entity Type Code',
            'Provider First Name': 'Provider First Name',
            'Provider Last Name (Legal Name)': 'Provider Last Name (Legal Name)',
            'Provider Organization Name (Legal Business Name)': 'Provider Organization Name (Legal Business Name)'
        }
      });
      
      setStreamResult('Batch created! Starting background processing...');
      
      base44.functions.invoke('importNPPESFlatFile', {
        batch_id: batch.id,
        file_url: streamUrl,
        byte_offset: 0
      }).catch(err => {
        toast.error('Stream processing error: ' + err.message);
      });
      
      toast.success('Streaming started in the background!');
      setStreamResult('Processing running in background. You can monitor it in the Data Center dashboard.');
    } catch (e) {
      toast.error('Failed to start stream: ' + e.message);
      setStreamResult('Error: ' + e.message);
    } finally {
      setStreaming(false);
    }
  };

  const pythonScript = `import pandas as pd
import math
import os

def split_nppes_csv(file_path, chunk_size=500000):
    print(f"Reading {file_path}...")
    # Read CSV in chunks to avoid memory issues
    chunk_container = pd.read_csv(file_path, chunksize=chunk_size, low_memory=False)
    
    file_count = 1
    base_name = os.path.basename(file_path).replace('.csv', '')
    
    for chunk in chunk_container:
        output_file = f"{base_name}_part_{file_count}.csv"
        print(f"Writing {output_file} ({len(chunk)} rows)...")
        chunk.to_csv(output_file, index=False)
        file_count += 1
        
    print("Done! You can now upload these smaller files to CareMetric.")

# Usage: Place this script in the same folder as your NPPES CSV
# Update the filename below to match the downloaded CSV
split_nppes_csv("npidata_pfile_20050523-20240107.csv")
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(pythonScript);
    setCopied(true);
    toast.success('Script copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-cyan-700/50 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="text-lg text-cyan-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          Handling the Massive Full NPPES Flat File (4GB+)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-300">
          The full NPPES registry file is too large to process in a single browser upload. 
          To successfully import it, you can either split the file locally or use our robust background streaming tool.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="p-4 border border-slate-700 bg-slate-800/50 rounded-lg">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-emerald-400" /> Option 1: Local Pre-Processing (Recommended)
            </h4>
            <p className="text-xs text-slate-400 mb-4">
              Download the ZIP from CMS, extract it, and use this Python script to split the massive CSV into smaller chunks. You can then upload them easily.
            </p>
            <div className="relative group">
              <pre className="bg-slate-950 p-3 rounded text-[10px] text-emerald-300 overflow-x-auto max-h-32">
                {pythonScript}
              </pre>
              <Button 
                size="sm" 
                variant="secondary" 
                className="absolute top-2 right-2 h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={copyToClipboard}
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          <div className="p-4 border border-slate-700 bg-slate-800/50 rounded-lg">
            <h4 className="font-semibold text-slate-200 flex items-center gap-2 mb-2">
              <Download className="w-4 h-4 text-cyan-400" /> Option 2: Distributed Streaming
            </h4>
            <p className="text-xs text-slate-400 mb-4">
              Upload the full extracted CSV to a secure cloud storage (like AWS S3) and paste the direct link here. 
              Our servers will use HTTP Range requests to chunk the download automatically.
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <input 
                type="text" 
                placeholder="https://your-bucket.s3.amazonaws.com/nppes_extracted.csv"
                className="w-full p-2 text-xs bg-slate-900 border border-slate-700 rounded text-slate-300 placeholder-slate-600"
                value={streamUrl}
                onChange={e => setStreamUrl(e.target.value)}
              />
              <Button onClick={startStream} disabled={streaming} className="w-full bg-cyan-700 hover:bg-cyan-600">
                <FileText className="w-4 h-4 mr-2" /> {streaming ? 'Starting...' : 'Start Distributed Stream'}
              </Button>
              {streamResult && <p className="text-xs text-cyan-400 mt-2">{streamResult}</p>}
              <p className="text-[10px] text-center text-slate-500">
                Requires the CSV to be accessible via URL and server to support Range headers.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}