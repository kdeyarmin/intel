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

        // Send email to all admins
        for (const admin of adminUsers) {
            await base44.integrations.Core.SendEmail({
                from_name: 'CareMetric Lead Discovery',
                to: admin.email,
                subject: `[${report.severity.toUpperCase()}] Import Error: ${report.title}`,
                body: `
A data import job has failed and requires your attention.

Error Report ID: ${report.id}
Severity: ${report.severity}
Type: ${report.error_type}
Created: ${new Date(report.created_date).toLocaleString()}

${report.description}

${batchInfo}

${errorSamplesText}

Context: ${JSON.stringify(report.context, null, 2)}

Please review this error in the Error Reports page:
${Deno.env.get('BASE44_APP_URL') || 'Your app'}/ErrorReports

---
This is an automated notification from CareMetric Lead Discovery.
                `
            });
        }

        return Response.json({ 
            success: true, 
            message: `Notification sent to ${adminUsers.length} admin(s)` 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});