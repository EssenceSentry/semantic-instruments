async (page) => {
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push({url:r.url(),failure:r.failure()?.errorText}));
 const out={};await page.goto('http://127.0.0.1:8773/');
 await page.waitForFunction(()=>window.__lab?.dataset?.manifest.id==='weapons-collection'&&!__lab.busy,{}, {timeout:60000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.item-strip img')].every(i=>i.complete&&i.naturalWidth>0));
 let aborted=false;
 await page.route('**/media/*.jpg',route=>{if(!aborted){aborted=true;route.abort()}else route.continue()});
 await page.getByRole('button',{name:/^Uncertainty Explorer/}).click();
 await page.getByRole('button',{name:/^Retry \d+ missing images/}).waitFor();
 out.loadingGuard=await page.getByRole('button',{name:'Loading images…',exact:true}).isDisabled();
 await page.unroute('**/media/*.jpg');await page.getByRole('button',{name:/^Retry \d+ missing images/}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.captcha-grid img')].length===9&&[...document.querySelectorAll('.captcha-grid img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.getByRole('button',{name:'Submit batch',exact:true}).waitFor();
 out.recoveredImages=await page.locator('.captcha-grid img').count();
 await page.getByRole('button',{name:'Audit image 1',exact:true}).click();await page.getByRole('button',{name:'Audit image 3',exact:true}).click();
 await page.getByRole('button',{name:'Audit image 3',exact:true}).press('Enter');
 await page.waitForFunction(()=>document.querySelector('.audit-inference>.metric-row').textContent.includes('2 positives in 1 batches'));
 out.keyboardBatch=await page.locator('.audit-inference>.metric-row').innerText();
 await page.getByRole('button',{name:'Undo last batch',exact:true}).click();
 const nav=async(name,id)=>{await page.getByRole('button',{name:new RegExp('^'+name)}).click();await page.waitForFunction(id=>__lab.tool===id,id)};
 out.viewports=[];
 for(const [width,height] of [[1440,1000],[1280,720],[559,863],[390,844]]){
  await page.setViewportSize({width,height});
  for(const [id,name] of [['space','Space Explorer'],['transform','Transformation Workbench'],['compose','Evidence Composer'],['rank','Ranking Comparator'],['uncertainty','Uncertainty Explorer']]){
   await nav(name,id);
   const state=await page.evaluate(()=>({overflow:[document.documentElement.scrollWidth-innerWidth,document.documentElement.scrollHeight-innerHeight],mathErrors:document.querySelectorAll('.katex-error').length,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent)}));
   if(state.overflow.some(v=>v>0)||state.mathErrors||state.alerts.length)throw new Error(JSON.stringify({width,id,...state}));
   if(id==='uncertainty'){
    await page.waitForFunction(()=>[...document.querySelectorAll('.captcha-grid img')].every(i=>i.complete&&i.naturalWidth>0));
    state.submitFits=await page.locator('.audit-submit button').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('.audit-task').getBoundingClientRect();return a.bottom<=Math.min(b.bottom,innerHeight)&&a.top>=b.top});
   }
   out.viewports.push({width,height,id,...state});
   if(width===1440||width===390||id==='uncertainty')await page.screenshot({path:`output/playwright/release-${id}-${width}.png`});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 out.errors=errors;out.failedRequests=requests;return out;
}
