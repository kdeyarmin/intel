import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        return Response.json({ error: 'AI integrations paused to save credits' });
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const reqBody = await req.json();
        const { action } = reqBody; // 'assign', 'analyze', 'resource'

        // Fetch tasks and users as service role so we have full context
        const tasks = await base44.asServiceRole.entities.CampaignTask.list();
        const users = await base44.asServiceRole.entities.User.list();

        const simplifiedTasks = tasks.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            assigned_to: t.assigned_to,
            due_date: t.due_date,
            type: t.type
        }));

        const simplifiedUsers = users.map(u => ({
            email: u.email,
            role: u.role,
            full_name: u.full_name
        }));

        let prompt = '';
        let schema = {};

        if (action === 'assign') {
            prompt = `You are an AI Project Manager. Given the following team members and the following tasks (some might be unassigned or unevenly distributed), intelligently assign unassigned tasks or re-assign them to optimize workload based on roles.
            Tasks: ${JSON.stringify(simplifiedTasks)}
            Users: ${JSON.stringify(simplifiedUsers)}
            Return a list of suggested assignments with reasoning. ONLY reassign if necessary or if task is unassigned.`;
            
            schema = {
                type: "object",
                properties: {
                    assignments: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                taskId: { type: "string" },
                                assigneeEmail: { type: "string" },
                                reason: { type: "string" }
                            }
                        }
                    }
                }
            };
        } else if (action === 'analyze') {
            prompt = `You are an AI Project Manager. Analyze the current project timelines and potential bottlenecks based on these tasks: ${JSON.stringify(simplifiedTasks)}. Focus on overdue tasks, high priority tasks, and overall progress.`;
            schema = {
                type: "object",
                properties: {
                    analysis: { type: "string" },
                    bottlenecks: {
                        type: "array",
                        items: { type: "string" }
                    },
                    estimatedCompletion: { type: "string" },
                    riskLevel: { type: "string", enum: ["Low", "Medium", "High"] }
                }
            };
        } else if (action === 'resource') {
            prompt = `You are an AI Project Manager. Provide intelligent resource allocation recommendations to optimize delivery for these tasks: ${JSON.stringify(simplifiedTasks)} and team members: ${JSON.stringify(simplifiedUsers)}. Identify who is overloaded, who is underutilized, and how to improve.`;
            schema = {
                type: "object",
                properties: {
                    recommendations: {
                        type: "array",
                        items: { type: "string" }
                    },
                    optimizationStrategy: { type: "string" },
                    overloadedMembers: { type: "array", items: { type: "string" } },
                    underutilizedMembers: { type: "array", items: { type: "string" } }
                }
            };
        } else {
            return Response.json({ error: 'Invalid action' }, { status: 400 });
        }

        const res = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            response_json_schema: schema
        });

        // Ensure we parse the response if it comes back as a string
        let result = res;
        if (typeof res === 'string') {
            try {
                result = JSON.parse(res);
            } catch (e) {
                // If it fails to parse, wrap it in an object matching the schema loosely
                if (action === 'analyze') result = { analysis: res, bottlenecks: [], riskLevel: 'Medium' };
                else if (action === 'resource') result = { recommendations: [res], optimizationStrategy: res };
                else if (action === 'assign') result = { assignments: [] };
            }
        }

        return Response.json(result);

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});