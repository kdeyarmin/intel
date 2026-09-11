// Narrow bridge for the verified hosted Intel runtime. No Express database assumptions.
export const APP_ID='6993c62145573ca8a97ad4a9';
export const APP_ORIGIN='https://caremetricintel.com';
export const AUTHORIZATION_URL='https://support-hub-web-production.up.railway.app/api/internal/admin/intel/authorize';
export const TOKEN_HEADER='X-CareMetric-Hub-Authorization';
export const operations=['capabilities','overview','users.list','support.identity.resolve'] as const;
type Row=Record<string,unknown>;
type Operation={operation:typeof operations[number];limit:number;offset:number;search:string;sourceUserId?:string;sourceAccountId?:string};
type Entity={filter:(query:Row,sort:string,limit:number,offset:number,fields:string[])=>Promise<unknown>};
export type Client={asServiceRole:{entities:Record<string,Entity>};cleanup?:()=>void};
type Options={getEnv:(name:string)=>string|undefined;createClient:(request:Request)=>Client;fetcher?:typeof fetch;now?:()=>Date};
class AdminError extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
function fail(status=503,code='upstream'):never{throw new AdminError(status,code);}
function object(value:unknown):Row{return value && typeof value==='object' && !Array.isArray(value)?value as Row:fail();}
function text(value:unknown,max=1000){return typeof value==='string' && value.length<=max?value:fail();}
function nullableText(value:unknown,max=1000){return value==null?null:text(value,max);}
function nativeId(value:unknown){const id=text(value,24);return /^[0-9a-f]{24}$/.test(id)?id:fail();}
function hubId(value:unknown){const id=text(value,36);return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)?id.toLowerCase():fail();}
function rows(value:unknown,limit:number){return Array.isArray(value) && value.length<=limit?value.map(object):fail();}
function parseOperation(value:unknown):Operation {
  const row=object(value);
  if(!operations.includes(row.operation as Operation['operation'])) return fail(400,'invalid_request');
  const operation=row.operation as Operation['operation'];
  if(operation==='support.identity.resolve') {
    if(Object.keys(row).sort().join(',')!=='operation,sourceAccountId,sourceUserId')return fail(400,'invalid_request');
    const sourceUserId=nativeId(row.sourceUserId),sourceAccountId=nativeId(row.sourceAccountId);
    if(sourceUserId!==sourceAccountId)return fail(400,'invalid_request');
    return {operation,sourceUserId,sourceAccountId,limit:20,offset:0,search:''};
  }
  const allowed=operation==='users.list'?['operation','search','limit','offset']:['operation'];
  if(Object.keys(row).some(key=>!allowed.includes(key))) return fail(400,'invalid_request');
  const limit=row.limit??20,offset=row.offset??0,search=row.search??'';
  if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>50||typeof offset!=='number'||!Number.isInteger(offset)||offset<0||offset>10000
    ||typeof search!=='string'||search.length>120||/[\u0000-\u001f\u007f*]/.test(search)) return fail(400,'invalid_request');
  return {operation,limit,offset,search:search.trim()};
}
async function bounded<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();let abort=()=>{};
  const canceled=new Promise<never>((_,reject)=>{abort=()=>reject(new AdminError(503,'upstream'));signal.addEventListener('abort',abort,{once:true});});
  try{return await Promise.race([promise,canceled]);}finally{signal.removeEventListener('abort',abort);}
}
async function readJson(source:Request|Response,max:number,signal:AbortSignal):Promise<unknown>{
  if(!source.body)return fail();
  const reader=source.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{
    for(;;){signal.throwIfAborted();const {value,done}=await bounded(reader.read(),signal);if(done)break;
      size+=value.byteLength;if(size>max||chunks.length>=64){cancel();return fail();}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes));
  }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}
export function readConfig(getEnv:Options['getEnv']){
  const enabled=getEnv('CAREMETRIC_ADMIN_ENABLED');if(!enabled||enabled==='false')return null;
  try{
    if(enabled!=='true')return fail();
    const entries=Object.entries(object(JSON.parse(getEnv('CAREMETRIC_ADMIN_IDENTITY_MAP_JSON')??'')));
    if(entries.length<1||entries.length>100)return fail();
    const identities=new Map(entries.map(([hub,native])=>[hubId(hub),nativeId(native)]));
    if(identities.size!==entries.length||new Set(identities.values()).size!==entries.length)return fail();
    const revision=getEnv('CAREMETRIC_ADMIN_SOURCE_REVISION');
    if(!revision||!/^[0-9a-f]{40}$/i.test(revision))return fail();
    return {identities,revision:revision.toLowerCase()};
  }catch{return fail(503,'unconfigured');}
}
function pinnedRequest(request:Request){
  if(request.headers.get('Base44-App-Id')!==APP_ID)return fail(403,'forbidden');
  const dataEnv=request.headers.get('X-Data-Env');if(dataEnv!==null&&dataEnv!=='prod')return fail(403,'forbidden');
  const service=request.headers.get('Base44-Service-Authorization')??'';
  if(!/^Bearer [^\s,]+$/.test(service)||service.length>8192)return fail(503,'unconfigured');
  return new Request(APP_ORIGIN,{method:'POST',headers:{'Base44-App-Id':APP_ID,'Base44-Service-Authorization':service}});
}
export function createCentralAdminHandler({getEnv,createClient,fetcher=fetch,now=()=>new Date()}:Options){
  const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
  return async(request:Request):Promise<Response>=>{
    let client:Client|undefined;
    try{
      const config=readConfig(getEnv);if(!config)return fail(503,'unconfigured');
      if(request.method!=='POST')return fail(405,'method_not_allowed');
      // Base44 injects cookies on server calls. Never consume or forward them.
      if(request.headers.get('Origin')?.trim())return fail(403,'forbidden');
      if(request.headers.get('Content-Type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return fail(415,'unsupported_content_type');
      const authorization=request.headers.get(TOKEN_HEADER)??'';
      if(!/^Bearer cmh_[A-Za-z0-9_-]{43}$/.test(authorization))return fail(401,'unauthenticated');
      const signal=AbortSignal.any([request.signal,AbortSignal.timeout(12000)]);
      let operation:Operation;
      try{operation=parseOperation(await readJson(request,2048,signal));}catch{return fail(400,'invalid_request');}
      // Hosted Deno supports manual redirects. Every 3xx is rejected; tokens never follow it.
      const response=await fetcher(AUTHORIZATION_URL,{method:'POST',redirect:'manual',signal,headers:{Authorization:authorization,'Content-Type':'application/json'},body:'{}'});
      if(response.redirected||(response.url && response.url!==AUTHORIZATION_URL)||(response.status>=300&&response.status<400))return fail();
      if(!response.ok)return fail(response.status===401?401:response.status===403?403:503,response.status===401?'unauthenticated':response.status===403?'forbidden':'upstream');
      let native:string|undefined;
      try{
        const actor=object(await readJson(response,4096,signal));
        if(Object.keys(actor).sort().join(',')!=='method,operation,role,user_id'||actor.role!=='platform_admin'||actor.method!=='sms'
          ||JSON.stringify(parseOperation(actor.operation))!==JSON.stringify(operation))return fail();
        native=config.identities.get(hubId(actor.user_id));
      }catch{return fail(403,'forbidden');}
      if(!native)return fail(403,'forbidden');
      client=createClient(pinnedRequest(request));const users=client.asServiceRole.entities.User;
      const actors=rows(await bounded(users.filter({id:native},'id',2,0,['id','role']),signal),2);
      if(actors.length!==1||actors[0].id!==native||actors[0].role!=='admin')return fail(403,'forbidden');
      let data:unknown;
      if(operation.operation==='capabilities')data={apiVersion:1,operations:[...operations],sourceRevision:config.revision};
      else if(operation.operation==='support.identity.resolve') {
        const sourceUserId=nativeId(operation.sourceUserId),sourceAccountId=nativeId(operation.sourceAccountId);
        const matches=rows(await bounded(users.filter({id:sourceUserId},'id',2,0,['id','role','updated_date']),signal),2);
        if(matches.length!==1||matches[0].id!==sourceUserId||!['admin','user'].includes(String(matches[0].role)))return fail(403,'forbidden');
        const updated=nullableText(matches[0].updated_date,100);
        if(updated!==null&&!Number.isFinite(Date.parse(updated)))return fail();
        const evidence=JSON.stringify(['intel',APP_ID,sourceUserId,matches[0].role,updated]);
        const revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(evidence))),b=>b.toString(16).padStart(2,'0')).join('');
        data={product:'intel',sourceUserId,sourceAccountId,accountKind:'individual',relationship:'individual_owner',revision};
      }
      else{
        const all:Row[]=[];let previous='';
        const fields=operation.operation==='overview'?['id','role']:['id','role','full_name','email','created_date'];
        for(let offset=0;offset<=10000;offset+=500){
          signal.throwIfAborted();const limit=Math.min(500,10001-offset);
          const page=rows(await bounded(users.filter({},'id',limit,offset,fields),signal),limit);
          for(const user of page){const id=nativeId(user.id);if(id<=previous||!['admin','user'].includes(String(user.role)))return fail();previous=id;all.push(user);}
          if(all.length>10000)return fail();if(page.length<limit)break;
        }
        if(operation.operation==='overview')data={organizationCount:null,activeUserCount:null,registeredUserCount:all.length};
        else{
          const filtered=all.filter(row=>!operation.search||`${nullableText(row.full_name)??''} ${nullableText(row.email,500)??''}`.toLowerCase().includes(operation.search.toLowerCase()));
          const items=filtered.slice(operation.offset,operation.offset+operation.limit).map(row=>{
            const createdAt=nullableText(row.created_date,100);if(createdAt!==null&&!Number.isFinite(Date.parse(createdAt)))return fail();
            return {id:nativeId(row.id),displayName:nullableText(row.full_name),email:nullableText(row.email,500),role:text(row.role,100),status:'registered',createdAt};
          });
          data={items,total:filtered.length,limit:operation.limit,offset:operation.offset};
        }
      }
      signal.throwIfAborted();return json({contractVersion:1,product:'intel',operation:operation.operation,generatedAt:now().toISOString(),data});
    }catch(error){return json({error:{code:error instanceof AdminError?error.code:'upstream'}},error instanceof AdminError?error.status:503);}
    finally{try{client?.cleanup?.();}catch{/* Never log credential-bearing errors. */}}
  };
}
