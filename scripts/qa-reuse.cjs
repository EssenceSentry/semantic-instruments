async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const out={};
 const ready=async()=>page.waitForFunction(()=>window.__lab&&__lab.dataset&&!__lab.busy,{}, {timeout:60000});
 const nav=async name=>page.getByRole('button',{name:new RegExp('^'+name)}).click();
 await page.reload();await ready();
 await nav('Uncertainty Explorer');await page.getByRole('button',{name:'Mini-audit',exact:true}).click();
 while(await page.getByRole('button',{name:'Undo last batch',exact:true}).isEnabled())await page.getByRole('button',{name:'Undo last batch',exact:true}).click();
 await page.getByRole('button',{name:'Type a count',exact:true}).click();
 await page.getByLabel('Number of positives',{exact:true}).fill('10');
 await page.getByLabel('Number of positives',{exact:true}).press('Enter');
 out.invalidCountAccepted=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.includes('audit:v1:weapons-collection')).some(([k,v])=>JSON.parse(v).length>0));
 await page.getByLabel('Number of positives',{exact:true}).fill('7');await page.getByLabel('Number of positives',{exact:true}).press('Enter');
 out.countBatch=await page.evaluate(()=>{const b=Object.entries(localStorage).filter(([k])=>k.includes('audit:v1:weapons-collection')).flatMap(([k,v])=>JSON.parse(v))[0];return {n:b.ids.length,s:b.positives,individualLabels:'selectedIds' in b}});
 await page.reload();await ready();
 out.recovered=await page.locator('.audit-inference>.metric-row').innerText();
 await page.screenshot({path:'output/playwright/mini-audit-live.png'});
 await page.getByRole('button',{name:'Undo last batch',exact:true}).click();
 await page.getByRole('button',{name:'Load your dataset',exact:true}).click();
 await page.getByRole('button',{name:/Damped oscillators · simulation 360/}).click();await ready();
 out.simulation=[];
 for(const name of ['Space Explorer','Transformation Workbench','Evidence Composer','Ranking Comparator','Uncertainty Explorer']){
  await nav(name);out.simulation.push({name,empty:await page.locator('.empty-state').count(),mathErrors:await page.locator('.katex-error').count(),overflow:await page.evaluate(()=>[document.documentElement.scrollWidth-innerWidth,document.documentElement.scrollHeight-innerHeight])});
 }
 await nav('Transformation Workbench');await page.getByRole('button',{name:'Vector algebra',exact:true}).click();
 out.algebra=await page.locator('.algebra-metrics').innerText();await page.screenshot({path:'output/playwright/vector-algebra.png'});
 await nav('Evidence Composer');await page.getByLabel('Collection measurement').selectOption('displacement');await page.getByLabel('Aggregation rule').selectOption('mean');
 out.numericMeans=await page.locator('.collection-summary').allTextContents();out.supportedAvailable=await page.locator('select[aria-label="Aggregation rule"] option[value="supported"]').count();
 await page.getByRole('button',{name:'Score profiles',exact:true}).click();await page.screenshot({path:'output/playwright/dynamics-composer.png'});
 await nav('Ranking Comparator');await page.getByLabel('Left ranking score').selectOption('displacement');out.negativeGeometricDisabled=await page.locator('option[value="corroboration"]').isDisabled();
 await page.getByLabel('Right ranking score').selectOption('energy');await page.getByLabel('Rank fusion rule').selectOption('rrf');
 await page.getByRole('button',{name:'Keep score & open sampling',exact:true}).click();
 out.savedScore=await page.evaluate(()=>({key:__lab.dataset.manifest.primaryScore,defined:__lab.dataset.manifest.items.filter(i=>i.scores[__lab.dataset.manifest.primaryScore]!=null).length}));
 await page.getByLabel('Sample quantity',{exact:true}).selectOption('displacement');await page.getByLabel('Sample size',{exact:true}).fill('360');await page.getByRole('button',{name:'Reveal population mean',exact:true}).click();
 out.census=await page.locator('.uncertainty-summary').innerText();await page.screenshot({path:'output/playwright/numeric-sampling.png'});
 await page.getByRole('button',{name:'Load your dataset',exact:true}).click();await page.getByRole('button',{name:/Weapons · paired videos 2,875/}).click();await ready();
 out.paired=await page.evaluate(()=>({rows:__lab.dataset.manifest.items.length,replayError:__lab.runtime.error,threads:__lab.runtime.threads}));
 out.errors=errors;out.alerts=await page.locator('[role=alert]').allTextContents();return out;
}
