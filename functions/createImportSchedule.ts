import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { import_type, schedule_type, schedule_time, runNow } = await req.json();

        const importTypeLabels = {
            'cms_utilization': 'CMS Provider Utilization',
            'cms_order_referring': 'Order & Referring Providers',
            'opt_out_physicians': 'Medicare Opt-Out Physicians',
            'provider_service_utilization': 'Provider Service Utilization',
            'home_health_enrollments': 'Home Health Enrollments',
            'hospice_enrollments': 'Hospice Enrollments',
        };

        const apiUrls = {
            'cms_utilization': 'https://data.cms.gov/data-api/v1/dataset/4c394e8d-c6b0-4e9f-8e98-3f85c1ea5d12/data',
            'cms_order_referring': 'https://data.cms.gov/data-api/v1/dataset/26e73b72-9e86-4af7-bd35-dedb33f1e986/data',
            'opt_out_physicians': 'https://data.cms.gov/data-api/v1/dataset/6bd6b1dd-208c-4f9c-88b8-b15fec6db548/data',
            'provider_service_utilization': 'https://data.cms.gov/data-api/v1/dataset/e38967e5-4acc-4f3c-a0dd-8c0d038e2b51/data',
            'home_health_enrollments': 'https://data.cms.gov/data-api/v1/dataset/8c52eb6b-1cce-4913-a16d-c2fa59c6ca67/data',
            'hospice_enrollments': 'https://data.cms.gov/data-api/v1/dataset/41f3f9fb-1d06-4b69-b8e2-f3d8c3c9b6a1/data',
        };

        const scheduleName = `Auto Import - ${importTypeLabels[import_type] || import_type}`;
        const fileUrl = apiUrls[import_type];

        let scheduleConfig = {
            automation_type: 'scheduled',
            name: scheduleName,
            function_name: 'autoImportCMSData',
            function_args: {
                import_type,
                file_url: fileUrl,
                year: new Date().getFullYear(),
                dry_run: false,
            },
            is_active: true,
        };

        if (schedule_type === 'daily') {
            scheduleConfig.repeat_interval = 1;
            scheduleConfig.repeat_unit = 'days';
            scheduleConfig.start_time = schedule_time;
        } else if (schedule_type === 'weekly') {
            scheduleConfig.repeat_unit = 'weeks';
            scheduleConfig.repeat_on_days = [1];
            scheduleConfig.start_time = schedule_time;
        } else if (schedule_type === 'monthly') {
            scheduleConfig.repeat_unit = 'months';
            scheduleConfig.repeat_on_day_of_month = 1;
            scheduleConfig.start_time = schedule_time;
        }

        // Use the Base44 SDK's built-in automation creation
        const automation = await base44.asServiceRole.createAutomation(scheduleConfig);

        // If runNow is true, trigger the import immediately
        if (runNow) {
            try {
                await base44.asServiceRole.functions.invoke('autoImportCMSData', scheduleConfig.function_args);
            } catch (err) {
                console.error('Failed to run immediate import:', err);
                // Don't fail the schedule creation if immediate run fails
            }
        }

        return Response.json({ success: true, automation });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});