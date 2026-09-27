async (page) => {
 const out={},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8773/');await page.waitForFunction(()=>window.__lab?.dataset&&!__lab.busy,{}, {timeout:60000});
 await page.route('https://i.ytimg.com/**',r=>r.abort());
 await page.evaluate(()=>__lab.load('/data/paired/manifest.json'));await page.waitForFunction(()=>__lab.dataset.manifest.id==='weapons-paired'&&!__lab.busy);
 await page.waitForFunction(()=>document.querySelectorAll('.item-strip img').length===10&&[...document.querySelectorAll('.item-strip img')].every(i=>i.complete&&i.naturalWidth>0));
 out.fallbacks=await page.locator('.item-strip img').evaluateAll(images=>images.every(i=>new URL(i.src).origin===location.origin));
 await page.unroute('https://i.ytimg.com/**');
 await page.route('https://i.ytimg.com/**',r=>r.abort());
 await page.locator('input[type=file]').first().setInputFiles('tests/fixtures/linked-preview.json');
 await page.waitForFunction(()=>__lab.dataset.manifest.id==='url-thumbnail-test'&&!__lab.busy);
 await page.getByRole('button',{name:/^Retry preview:/}).waitFor();out.failureVisible=true;
 await page.unroute('https://i.ytimg.com/**');await page.getByRole('button',{name:/^Retry preview:/}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.item-strip img')].some(i=>i.complete&&i.naturalWidth>0));out.retryRecovered=true;
 await page.getByRole('button',{name:/^Linked thumbnail test/}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export this dataset package',exact:true}).click();const download=await downloadPromise;await download.saveAs('output/playwright/url-thumbnail-test.silab');
 out.exported=download.suggestedFilename();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('input[type=file]').first().setInputFiles('output/playwright/url-thumbnail-test.silab');await page.waitForFunction(()=>!__lab.busy);
 out.roundtrip=await page.evaluate(()=>__lab.dataset.manifest.items[0].media);
 out.errors=errors;return out;
}
