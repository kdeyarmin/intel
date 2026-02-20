import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { error_report_id, batch_id } = await req.json();

        // Fetch error report details
        const errorReport = await base44.asServiceRole.entities.ErrorReport.filter({ id: error_report_id });
        if (errorReport.length === 0) {
            return Response.json({ error: 'Error report not found' }, { status: 404 });
        }

        const report = errorReport[0];
        
        // Fetch batch details if available
        let batchInfo = '';
        if (batch_id) {
            const batches = await base44.asServiceRole.entities.ImportBatch.filter({ id: batch_id });
            if (batches.length > 0) {
                const batch = batches[0];
                batchInfo = `
Import Details:
- Import Type: ${batch.import_type}
- File: ${batch.file_name}
- Total Rows: ${batch.total_rows || 0}
- Valid Rows: ${batch.valid_rows || 0}
- Invalid Rows: ${batch.invalid_rows || 0}
- Status: ${batch.status}
                `;
            }
        }

        // Format error samples
        let errorSamplesText = '';
        if (report.error_samples && report.error_samples.length > 0) {
            errorSamplesText = '\n\nError Samples:\n' + 
                report.error_samples.slice(0, 5).map((err, idx) => 
                    `${idx + 1}. Row ${err.row || 'N/A'}: ${err.message}`
                ).join('\n');
        }

        // Get all admin users
        const allUsers = await base44.asServiceRole.entities.User.list();
        const adminUsers = allUsers.filter(u => u.role === 'admin');

        // Email notifications disabled per admin request
        return Response.json({ 
            success: true, 
            message: `Email notifications are disabled. ${adminUsers.length} admin(s) would have been notified.` 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});