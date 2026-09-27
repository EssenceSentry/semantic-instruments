async (page) => {
 const errors=[],out={};page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8773/');await page.waitForFunction(()=>window.__lab?.dataset?.manifest.id==='weapons-collection'&&!__lab.busy,{}, {timeout:60000});
 await page.setViewportSize({width:1440,height:1000});
 const nav=async(name,id)=>{await page.getByRole('button',{name:new RegExp('^'+name)}).click();await page.waitForFunction(id=>__lab.tool===id,id);await page.waitForFunction(()=>!document.querySelector('main[inert]'));};
 await page.getByRole('button',{name:'Hide top bars',exact:true}).click();await page.getByRole('button',{name:'Show top bars',exact:true}).click();out.focusRestored=await page.locator('.masthead').isVisible();
 await nav('Uncertainty Explorer','uncertainty');
 await page.getByRole('button',{name:'Submit batch',exact:true}).waitFor();
 await page.getByRole('button',{name:'Audit image 2',exact:true}).click();
 await page.getByRole('button',{name:'Expand audit',exact:true}).click();
 out.popupSelection=await page.getByRole('button',{name:'Audit image 2',exact:true}).getAttribute('aria-pressed');
 await page.getByRole('button',{name:'Audit image 4',exact:true}).click();
 await page.screenshot({path:'output/playwright/ux-expanded-audit.png'});
 out.popupTile=await page.locator('dialog .captcha-grid img').first().boundingBox();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 out.returnSelection=await page.getByRole('button',{name:'Audit image 4',exact:true}).getAttribute('aria-pressed');
 out.viewports=[];
 for(const [width,height] of [[1440,1000],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});
  for(const [name,id] of [['Space Explorer','space'],['Transformation Workbench','transform'],['Evidence Composer','compose'],['Ranking Comparator','rank'],['Uncertainty Explorer','uncertainty']]){
   const start=Date.now();await nav(name,id);
   const state=await page.evaluate(()=>({overflow:[document.documentElement.scrollWidth-innerWidth,document.documentElement.scrollHeight-innerHeight],mathErrors:document.querySelectorAll('.katex-error').length,titleHeight:document.querySelector('.title-row')?.getBoundingClientRect().height??0,selectPadding:[...document.querySelectorAll('select')].every(s=>parseFloat(getComputedStyle(s).paddingRight)>=32)}));
   if(state.overflow.some(x=>x>0)||state.mathErrors)throw new Error(JSON.stringify({width,id,...state}));
   if(id==='uncertainty')state.submitFits=await page.locator('.audit-submit button').evaluate(e=>{const r=e.getBoundingClientRect(),c=e.closest('.audit-task').getBoundingClientRect();return r.bottom<=Math.min(c.bottom,innerHeight)});
   out.viewports.push({width,id,ms:Date.now()-start,...state});
   if(width===1280||width===390)await page.screenshot({path:`output/playwright/ux-${id}-${width}.png`});
  }
 }
 await page.setViewportSize({width:1440,height:1000});out.errors=errors;
 return out;
}
