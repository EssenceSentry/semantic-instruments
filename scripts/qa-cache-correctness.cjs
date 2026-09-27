async (page) => {
 const html=await (await page.request.get('http://127.0.0.1:8773/')).text();
 const entry=html.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/)[1];
 const js=await (await page.request.get('http://127.0.0.1:8773'+entry)).text();
 const path=js.match(/\/assets\/engine\.worker-[^"']+\.js/)[0];
 return await page.evaluate(async path=>{
  const worker=new Worker(path,{type:'module'});let id=0;const pending=new Map();
  worker.onmessage=({data})=>{if(data.progress)return;const p=pending.get(data.id);pending.delete(data.id);data.ok?p.resolve(data.result):p.reject(Error(data.error));};
  const send=(type,payload)=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});worker.postMessage({id,type,payload})});
  const matrix=v=>({rows:2,cols:2,data:new Float32Array(v)}),x=matrix([.17,.29,.51,.83]);
  const nodes=[{id:'z',op:'dense',inputs:['x'],weight:[[.613,-.471]],bias:[.023]},{id:'p',op:'sigmoid',inputs:['z']}];
  const graph={nodes,inputs:['x'],capture:['z','p']};
  await send('load',{matrices:{x}});const first=await send('graph',graph);
  await send('load',{matrices:{x}});const cached=await send('graph',graph);
  const project=await send('project',{key:'p',mean:[0],components:[[1]]});
  const equal=(a,b)=>JSON.stringify(Array.from(a))===JSON.stringify(Array.from(b));
  if(!cached.cached || !equal(first.matrices.p.data,cached.matrices.p.data)||!equal(first.matrices.p.data,project.matrix.data))throw Error('Cached graph failed to restore dependent matrix');
  const changed=structuredClone(graph);changed.nodes[0].weight[0][0]+=.1;
  const changedWeights=await send('graph',changed);
  if(equal(first.matrices.p.data,changedWeights.matrices.p.data))throw Error('Changed weights did not affect graph');
  await send('load',{matrices:{x:matrix([.18,.29,.51,.83])}});const changedInput=await send('graph',graph);
  if(equal(first.matrices.p.data,changedInput.matrices.p.data))throw Error('Changed array did not invalidate graph');
  // Queue load and graph without awaiting: mutable worker state must execute in request order.
  const load=send('load',{matrices:{x}}),rerun=send('graph',graph);await load;const queued=await rerun;
  if(!equal(queued.matrices.p.data,first.matrices.p.data))throw Error('Worker request order changed results');
  worker.terminate();return {graphCache:true,restoredDependentProjection:true,weightInvalidation:true,arrayInvalidation:true,serializedRequests:true};
 },path);
}
