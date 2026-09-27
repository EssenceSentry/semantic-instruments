async (page) => {
 const out={steps:[],errors:[],layout:[]}; page.on('pageerror',e=>out.errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('http://127.0.0.1:8773/?v=1.2');
 await page.waitForFunction(()=>window.__lab?.dataset?.manifest.id==='weapons-collection'&&!__lab.busy,{}, {timeout:60000});
 out.before=await page.evaluate(()=>({audit:Object.keys(localStorage).filter(k=>k.startsWith('semantic-instruments:audit')).map(k=>[k,localStorage.getItem(k)]),intervention:__lab.intervention}));
 await page.getByRole('button',{name:'Guided tour',exact:true}).click();
 await page.getByRole('button',{name:/Start the full tour|Start again/}).last().click();
 await page.locator('.driver-popover').waitFor();
 const total=await page.evaluate(()=>__tour.count);
 for(let i=0;i<total;i++) {
  await page.waitForFunction(()=>window.__tour?.active&&!__tour.preparing);
  const info=await page.locator('.driver-popover').evaluate(e=>{const r=e.getBoundingClientRect(),t=document.querySelector('.driver-active-element')?.getBoundingClientRect();return {id:e.dataset.tourStep,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,target:t?{x:t.x,y:t.y,w:t.width,h:t.height}:null,scroll:document.documentElement.scrollWidth>innerWidth+1};});
  out.steps.push(info.id);
  const body=page.locator('.driver-popover-description');if(!await body.isVisible()||await body.innerText()==='')throw new Error('Missing explanation '+info.id);
  if(info.x<0||info.y<0||info.right>1441||info.bottom>1001||info.scroll)out.layout.push(info);
  if(['welcome','query-scores','network','monte-carlo'].includes(info.id))await page.screenshot({path:'output/playwright/tour-'+info.id+'.png'});
  if(i===total-1)break;
  const old=info.id;
  await page.getByRole('button',{name:'Next tour step',exact:true}).click();
  try{await page.waitForFunction(id=>document.querySelector('.driver-popover')?.getAttribute('data-tour-step')!==id&&window.__tour?.active&&!__tour.preparing,old,{timeout:18000});}
  catch(e){out.failure={after:old,notice:await page.locator('.tour-notice').textContent().catch(()=>null)};break;}
 }
 out.after=await page.evaluate(()=>({audit:Object.keys(localStorage).filter(k=>k.startsWith('semantic-instruments:audit')).map(k=>[k,localStorage.getItem(k)]),intervention:__lab.intervention}));
 out.count=total;return out;
}
