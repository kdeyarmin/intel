import { createClientFromRequest } from 'npm:@base44/sdk@0.8.18';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const payload = await req.json();
        const { connector_id } = payload;
        if (!connector_id) {
            return Response.json({ error: 'Missing connector_id' }, { status: 400 });
        }

        const connector = await base44.entities.CMSApiConnector.get(connector_id);
        if (!connector) {
            return Response.json({ error: 'Connector not found' }, { status: 404 });
        }

        let testStatus = 'failed';
        let testMessage = 'Unknown error';
        
        try {
            const headers = {};
            if (connector.api_key) {
                headers['Authorization'] = `Bearer ${connector.api_key}`;
                headers['X-API-KEY'] = connector.api_key;
            }

            const startTime = Date.now();
            // Just doing a HEAD or basic GET to check if it's reachable. Some APIs don't like HEAD.
            const response = await fetch(connector.api_url, {
                method: 'GET',
                headers,
                // Setting a timeout using AbortSignal if possible, but fetch in Deno doesn't natively support simple timeouts without AbortController
            });
            const duration = Date.now() - startTime;

            if (response.ok || response.status === 401 || response.status === 403 || response.status === 404) {
                // If it's a 401/403 and we provided an API key, the key might be invalid
                if ((response.status === 401 || response.status === 403) && connector.api_key) {
                    testStatus = 'failed';
                    testMessage = `Authentication failed (${response.status})`;
                } else if (response.status >= 500) {
                    testStatus = 'failed';
                    testMessage = `Server error (${response.status})`;
                } else {
                    testStatus = 'success';
                    testMessage = `Connected successfully in ${duration}ms (Status: ${response.status})`;
                }
            } else {
                testStatus = 'failed';
                testMessage = `HTTP Error ${response.status}`;
            }
        } catch (error) {
            testStatus = 'failed';
            testMessage = `Connection failed: ${error.message}`;
        }

        const updatedConnector = await base44.entities.CMSApiConnector.update(connector_id, {
            test_status: testStatus,
            test_message: testMessage,
            last_tested_at: new Date().toISOString()
        });

        return Response.json({ success: true, connector: updatedConnector });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});