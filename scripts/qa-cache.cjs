async (page) => {
 const out={},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8773/');await page.waitForFunction(()=>window.__lab?.dataset&&!__lab.busy,{}, {timeout:60000});
 await page.getByRole('button',{name:'Presentation cache',exact:true}).click();
 const start=Date.now();await page.getByRole('button',{name:'Prepare all built-in datasets',exact:true}).click();
 await page.waitForFunction(()=>__lab.busy);
 out.progressVisible=await page.locator('.preparation-status progress').isVisible();
 await page.waitForFunction(()=>!__lab.busy,{}, {timeout:240000});
 out.prepareMs=Date.now()-start;
 out.prepared=await page.evaluate(()=>({prepared:__lab.prepared,stats:__lab.engineStats,alert:document.querySelector('.error-banner')?.textContent}));
 await page.screenshot({path:'output/playwright/ux-presentation-cache.png'});
 await page.getByRole('button',{name:'Close',exact:true}).click();
 const call=async next=>await page.evaluate(async next=>{const start=performance.now(),before={...__lab.engineStats};await __lab.applyIntervention(next);const d=__lab.dataset,m=d.manifest,changed=document.querySelector('.error-banner')?.textContent;return {ms:performance.now()-start,before,after:{...__lab.engineStats},error:changed};},next);
 out.preparedIntervention=await call({bankId:'image',disabled:[],temperature:.25,zeroFamilies:[]});
 await call({disabled:[],temperature:null,zeroFamilies:[]});
 out.replayedIntervention=await call({bankId:'image',disabled:[],temperature:.25,zeroFamilies:[]});
 await call({disabled:[],temperature:null,zeroFamilies:[]});
 const reload=Date.now();await page.reload();await page.waitForFunction(()=>window.__lab?.dataset?.manifest.id==='weapons-collection'&&!__lab.busy,{}, {timeout:60000});
 out.reloadMs=Date.now()-reload;out.persisted=await page.evaluate(()=>({stats:__lab.engineStats,prepared:Object.keys(__lab.prepared),isolated:crossOriginIsolated}));
 await page.evaluate(()=>__lab.load('/data/paired/manifest.json'));await page.waitForFunction(()=>__lab.dataset.manifest.id==='weapons-paired'&&!__lab.busy);
 await page.waitForFunction(()=>[...document.querySelectorAll('.item-strip img')].length>0&&[...document.querySelectorAll('.item-strip img')].every(i=>i.complete&&i.naturalWidth>0));
 out.urls=await page.evaluate(()=>[...document.querySelectorAll('.item-strip img')].map(i=>({url:i.src,loaded:i.complete&&i.naturalWidth>0})));
 out.errors=errors;return out;
}
