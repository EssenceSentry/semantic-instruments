async (page) => {
 const out={},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8773/');await page.waitForFunction(()=>window.__lab?.dataset?.manifest.id==='weapons-collection'&&!__lab.busy,{}, {timeout:60000});
 await page.evaluate(()=>__lab.applyIntervention({bankId:'image',disabled:[],temperature:.25,zeroFamilies:[]}));await page.waitForFunction(()=>!__lab.busy);
 await page.getByRole('button',{name:'Methods and provenance',exact:true}).click();
 await page.getByRole('button',{name:'Recompute similarities from embeddings',exact:true}).click();await page.waitForFunction(()=>!__lab.busy);
 out.interventionRetained=await page.evaluate(()=>__lab.intervention.temperature===.25);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(()=>__lab.applyIntervention({disabled:[],temperature:null,zeroFamilies:[]}));await page.waitForFunction(()=>!__lab.busy);
 await page.setViewportSize({width:1280,height:720});await page.getByRole('button',{name:/^Uncertainty Explorer/}).click();await page.waitForFunction(()=>__lab.tool==='uncertainty'&&!document.querySelector('main[inert]'));
 await page.getByRole('button',{name:'Submit batch',exact:true}).waitFor();await page.screenshot({path:'output/playwright/ux-final-audit-1280.png'});
 out.band5Visible=await page.locator('.audit-bands button').last().evaluate(e=>{const a=e.getBoundingClientRect(),b=e.closest('aside').getBoundingClientRect();return a.bottom<=b.bottom});
 await page.getByRole('button',{name:'Expand audit',exact:true}).click();await page.getByRole('button',{name:'Audit image 1',exact:true}).click();await page.getByRole('button',{name:'Close',exact:true}).click();out.selected=await page.getByRole('button',{name:'Audit image 1',exact:true}).getAttribute('aria-pressed');await page.getByRole('button',{name:'Audit image 1',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'output/playwright/ux-final-audit.png'});out.errors=errors;return out;
}
