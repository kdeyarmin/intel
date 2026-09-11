import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { createCentralAdminHandler } from './handler.ts';
Deno.serve(createCentralAdminHandler({getEnv:name=>Deno.env.get(name),createClient:createClientFromRequest}));
