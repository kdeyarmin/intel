import { describe,expect,it,vi } from 'vitest';
import { APP_ID,APP_ORIGIN,AUTHORIZATION_URL,TOKEN_HEADER,createCentralAdminHandler,readConfig } from '../base44/functions/centralAdminRead/handler';
const owner='00000000-0000-4000-8000-000000000001',native='6993c62145573ca8a97ad4aa';
const id=(value:number)=>value.toString(16).padStart(24,'0');
const env={CAREMETRIC_ADMIN_ENABLED:'true',CAREMETRIC_ADMIN_IDENTITY_MAP_JSON:JSON.stringify({[owner]:native}),CAREMETRIC_ADMIN_SOURCE_REVISION:'a'.repeat(40)};
const user={id:id(1),role:'user',email:'someone@example.invalid',full_name:'Example user',created_date:'2026-01-01T00:00:00Z',password:'never-export'};
function fixture({records=[user],actorRole='admin',actorId=native,settings={},authorizeStatus=200,authority={},filterOverride,fetchOverride}: {
  records?:Record<string,unknown>[];actorRole?:string;actorId?:string;settings?:Record<string,string>;authorizeStatus?:number;authority?:Record<string,unknown>;
  filterOverride?:(query:Record<string,unknown>,sort:string,limit:number,offset:number,fields:string[])=>Promise<unknown>;fetchOverride?:typeof fetch;
}={}){
  let requested:unknown={operation:'capabilities'};
  const cleanup=vi.fn();
  const filter=vi.fn(filterOverride??(async(query,_sort,limit,offset,fields)=>{
    if(query.id)return [{id:actorId,role:actorRole}];
    return records.slice(offset,offset+limit).map(row=>Object.fromEntries(fields.map(key=>[key,row[key]])));
  }));
  const createClient=vi.fn(()=>({asServiceRole:{entities:{User:{filter}}},cleanup}));
  const fetcher=vi.fn(fetchOverride??(async(url,options)=>{
    expect(url).toBe(AUTHORIZATION_URL);expect(options?.redirect).toBe('manual');expect(options?.body).toBe('{}');
    expect(Object.keys(options?.headers??{}).sort()).toEqual(['Authorization','Content-Type']);
    return Response.json({user_id:owner,role:'platform_admin',method:'sms',operation:requested,...authority},{status:authorizeStatus});
  }) as typeof fetch);
  const config={...env,...settings};
  const handler=createCentralAdminHandler({getEnv:name=>config[name],createClient,fetcher,now:()=>new Date('2026-09-11T18:00:00Z')});
  const request=(body:unknown={operation:'capabilities'},headers:Record<string,string>={},method='POST',signal?:AbortSignal)=>{
    requested=body;
    return handler(new Request(APP_ORIGIN+'/functions/centralAdminRead',{method,headers:{'Content-Type':'application/json',[TOKEN_HEADER]:'Bearer cmh_'+'a'.repeat(43),'Base44-App-Id':APP_ID,'Base44-Service-Authorization':'Bearer synthetic-service',...headers},body:method==='GET'?undefined:JSON.stringify(body),signal}));
  };
  return {request,handler,filter,fetcher,createClient,cleanup};
}
describe('actual Intel hosted Hub handler',()=>{
  it.each(['capabilities','overview','users.list'])('authorizes and projects %s',async operation=>{
    const f=fixture();const response=await f.request({operation});expect(response.status).toBe(200);
    const data=await response.json();expect(data.product).toBe('intel');expect(data.operation).toBe(operation);expect(JSON.stringify(data)).not.toContain('never-export');
    if(operation==='overview')expect(data.data).toEqual({organizationCount:null,activeUserCount:null,registeredUserCount:1});
    if(operation==='users.list')expect(data.data.items[0].status).toBe('registered');
    expect(f.cleanup).toHaveBeenCalledTimes(1);
  });
  it.each(['','false','TRUE'])('fails closed for enable flag %j',async flag=>{
    const f=fixture({settings:{CAREMETRIC_ADMIN_ENABLED:flag}});expect((await f.request()).status).toBe(503);expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(['{}','not-json',JSON.stringify({[owner]:'bad'}),JSON.stringify({[owner]:native,'00000000-0000-4000-8000-000000000002':native})])('rejects invalid exact mappings %s',mapping=>{
    expect(()=>readConfig(name=>({...env,CAREMETRIC_ADMIN_IDENTITY_MAP_JSON:mapping})[name])).toThrow();
  });
  it('requires a reviewed source revision',async()=>{expect((await fixture({settings:{CAREMETRIC_ADMIN_SOURCE_REVISION:'main'}}).request()).status).toBe(503);});
  it.each([{operation:'organizations.list'},{operation:'billing.overview'},{operation:'users.delete'},{operation:'overview',product:'pennsync'},{operation:'users.list',limit:51},{operation:'users.list',offset:-1},{operation:'users.list',search:'*'},{operation:'users.list',search:'a\nb'},{operation:'users.list',userId:native}])('rejects unsupported request %j before consuming a capability',async request=>{
    const f=fixture();expect((await f.request(request)).status).toBe(400);expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(['https://caremetricintel.com','null','https://elsewhere.invalid'])('rejects browser origin %s',async origin=>{const f=fixture();expect((await f.request(undefined,{Origin:origin})).status).toBe(403);expect(f.fetcher).not.toHaveBeenCalled();});
  it('ignores injected cookies and strips alternate SDK origins/data selectors',async()=>{
    const f=fixture();expect((await f.request(undefined,{Cookie:'hosted=value','Base44-Api-Url':'https://elsewhere.invalid','Base44-State':'alternate','Authorization':'Bearer browser-token'})).status).toBe(200);
    const request=f.createClient.mock.calls[0][0] as Request;
    expect(request.url).toBe(APP_ORIGIN+'/');expect([...request.headers.keys()].sort()).toEqual(['base44-app-id','base44-service-authorization']);
  });
  it.each([{'Base44-App-Id':'another-app'},{'X-Data-Env':'dev'},{'Base44-Service-Authorization':''}])('rejects invalid hosted credentials %j',async headers=>{
    const f=fixture();expect((await f.request(undefined,headers)).status).toBeGreaterThanOrEqual(400);expect(f.createClient).not.toHaveBeenCalled();
  });
  it('accepts only the custom one-use SMS header',async()=>{
    const f=fixture();expect((await f.request(undefined,{[TOKEN_HEADER]:'',Authorization:'Bearer cmh_'+'a'.repeat(43)})).status).toBe(401);expect(f.fetcher).not.toHaveBeenCalled();
    expect((await f.request(undefined,{[TOKEN_HEADER]:'Bearer header.payload.signature'})).status).toBe(401);
  });
  it.each([301,302,307,308])('rejects authorization redirect %s without a second fetch',async authorizeStatus=>{
    const f=fixture({authorizeStatus});expect((await f.request()).status).toBe(503);expect(f.fetcher).toHaveBeenCalledTimes(1);expect(f.createClient).not.toHaveBeenCalled();
  });
  it.each([401,403,500])('rejects denied/unavailable authority %s',async authorizeStatus=>{const f=fixture({authorizeStatus});expect((await f.request()).status).toBe(authorizeStatus===500?503:authorizeStatus);expect(f.filter).not.toHaveBeenCalled();});
  it.each([{redirected:true},{url:'https://other.invalid/authorize'}])('rejects an unexpectedly followed authorization response %j',async properties=>{
    const f=fixture({fetchOverride:async()=>{const response=Response.json({user_id:owner,role:'platform_admin',method:'sms',operation:{operation:'capabilities'}});for(const [key,value] of Object.entries(properties))Object.defineProperty(response,key,{value});return response;}});
    expect((await f.request()).status).toBe(503);expect(f.createClient).not.toHaveBeenCalled();
  });
  it.each([{method:'totp'},{role:'customer'},{user_id:'00000000-0000-4000-8000-000000000003'},{operation:{operation:'users.list'}},{extra:'not-allowed'}])('rejects mismatched authority %j',async authority=>{
    const f=fixture({authority});expect((await f.request()).status).toBe(403);expect(f.filter).not.toHaveBeenCalled();
  });
  it('rejects a demoted native administrator before directory reads',async()=>{const f=fixture({actorRole:'user'});expect((await f.request({operation:'overview'})).status).toBe(403);expect(f.filter).toHaveBeenCalledTimes(1);});
  it('rejects a different native ID even if role is admin',async()=>{expect((await fixture({actorId:id(9)}).request()).status).toBe(403);});
  it('uses bounded projected pages and literal search',async()=>{
    const records=Array.from({length:501},(_,index)=>({...user,id:id(index+1),full_name:index===500?'Literal 100%_':'Other'}));
    const f=fixture({records});const response=await f.request({operation:'users.list',search:'100%_',limit:1,offset:0});
    const data=await response.json();expect(data.data.total).toBe(1);expect(data.data.items[0].id).toBe(id(501));
    expect(f.filter.mock.calls.filter(call=>!call[0].id).map(call=>call.slice(1,4))).toEqual([['id',500,0],['id',500,500]]);
  });
  it('rejects unordered/duplicate pages rather than report partial totals',async()=>{expect((await fixture({records:[{...user,id:id(2)},user]}).request({operation:'overview'})).status).toBe(503);});
  it('fails closed beyond the full scan bound',async()=>{
    const records=Array.from({length:10001},(_,index)=>({...user,id:id(index+1)}));const f=fixture({records});expect((await f.request({operation:'overview'})).status).toBe(503);
  });
  it('never returns raw SDK errors or credentials',async()=>{
    const f=fixture({filterOverride:async()=>{throw new Error('Bearer private-vendor-credential');}});const response=await f.request();expect(await response.json()).toEqual({error:{code:'upstream'}});expect(f.cleanup).toHaveBeenCalledTimes(1);
  });
  it('stops waiting for a stalled SDK operation when the request aborts',async()=>{
    const controller=new AbortController();const f=fixture({filterOverride:()=>new Promise(()=>{})});const pending=f.request(undefined,{},'POST',controller.signal);
    await vi.waitFor(()=>expect(f.filter).toHaveBeenCalledOnce());controller.abort();expect((await pending).status).toBe(503);expect(f.cleanup).toHaveBeenCalledOnce();
  });
});
