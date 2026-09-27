async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const out={};
 await page.locator('input[accept=".json,.zip,.silab,.parquet"]').setInputFiles('output/playwright/image-toy-model.silab');
 await page.waitForFunction(()=>__lab.dataset.manifest.model?.id==='browser-logistic-probe'&&!__lab.busy,{}, {timeout:60000});
 await page.getByRole('button',{name:'Load your dataset',exact:true}).click();await page.getByRole('button',{name:'Refit the browser linear probe',exact:true}).click();
 await page.waitForFunction(()=>!__lab.busy&&!document.querySelector('.modal'),{}, {timeout:60000});
 out.refit=await page.evaluate(()=>{const d=__lab.dataset;return {rows:d.manifest.items.length,representations:d.manifest.representations.length,uniqueRepresentations:new Set(d.manifest.representations.map(r=>r.id)).size,replayError:__lab.runtime.error}});
 if(out.refit.representations!==out.refit.uniqueRepresentations)throw new Error('Duplicate representations after refit');
 await page.goto('http://127.0.0.1:8773/');await page.waitForFunction(()=>window.__lab?.dataset?.manifest.id==='weapons-collection'&&!__lab.busy,{}, {timeout:60000});
 out.native=await page.evaluate(()=>({rows:__lab.dataset.manifest.items.length,replayError:__lab.runtime.error}));
 await page.screenshot({path:'output/playwright/final-space.png'});
 await page.getByRole('button',{name:/^Ranking Comparator/}).click();await page.getByRole('button',{name:'Precision & recall',exact:true}).click();
 out.ranking=await page.locator('.curve-legend').innerText();await page.screenshot({path:'output/playwright/final-ranking.png'});
 await page.getByRole('button',{name:/^Uncertainty Explorer/}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.captcha-grid img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:'output/playwright/final-mini-audit.png'});
 out.errors=errors;out.alerts=await page.locator('[role=alert]').allTextContents();return out;
}
