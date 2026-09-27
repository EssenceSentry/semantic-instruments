async (page) => {
 const out={runs:[],errors:[]};page.on('pageerror',e=>out.errors.push(e.message));
 await page.goto('http://127.0.0.1:8773/?v=1.2');
 await page.waitForFunction(()=>window.__lab?.dataset&&!__lab.busy,{}, {timeout:60000});
 for(const cfg of [
  {id:'weapons-paired',url:'/data/paired/manifest.json',w:1280,h:720},
  {id:'damped-oscillators',url:'/data/dynamics/manifest.json',w:390,h:844},
  {id:'weapons-collection',url:'/data/collection/manifest.json',w:390,h:844}
 ]) {
  await page.setViewportSize({width:cfg.w,height:cfg.h});
  await page.evaluate(url=>__lab.load(url),cfg.url);
  await page.waitForFunction(id=>__lab.dataset.manifest.id===id&&!__lab.busy,cfg.id,{timeout:60000});
  await page.getByRole('button',{name:'Guided tour',exact:true}).click();
  await page.getByLabel('Tour narration',{exact:true}).selectOption(cfg.id.startsWith('weapons')?'weapons':'default');
  const variant=await page.getByLabel('Tour narration',{exact:true}).inputValue();
  await page.screenshot({path:'output/playwright/tour-menu-'+cfg.id+'.png'});
  await page.getByRole('button',{name:/Start the full tour|Start again/}).last().click();
  await page.waitForFunction(()=>window.__tour?.active&&!__tour.preparing);
  const n=await page.evaluate(()=>__tour.count),r={id:cfg.id,variant,count:n,steps:[],layout:[],emptyBody:[]};
  for(let i=0;i<n;i++) {
   await page.waitForFunction(()=>__tour.active&&!__tour.preparing);
   const info=await page.locator('.driver-popover').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.querySelector('.driver-popover-description');return {id:e.dataset.tourStep,x:r.x,y:r.y,right:r.right,bottom:r.bottom,bodyVisible:p.getBoundingClientRect().height>20,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   r.steps.push(info.id);
   if(!info.bodyVisible)r.emptyBody.push(info.id);
   if(info.x<0||info.y<0||info.right>cfg.w+1||info.bottom>cfg.h+1||info.overflow)r.layout.push(info);
   if(['welcome','network','nine-images','sample-size'].includes(info.id))await page.screenshot({path:'output/playwright/tour-'+cfg.id+'-'+info.id+'.png'});
   if(i===n-1) { await page.getByRole('button',{name:'Finish tour',exact:true}).click();break; }
   await page.getByRole('button',{name:'Next tour step',exact:true}).click();
   try{await page.waitForFunction(id=>document.querySelector('.driver-popover')?.getAttribute('data-tour-step')!==id&&__tour.active&&!__tour.preparing,info.id,{timeout:18000});}
   catch{r.failure={after:info.id,notice:await page.locator('.tour-notice').textContent().catch(()=>null)};break;}
  }
  r.completed=await page.locator('.tour-notice').textContent().catch(()=>null);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  out.runs.push(r);
 }
 return out;
}
