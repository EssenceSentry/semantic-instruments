async (page) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const out={};
 out.encoder=await page.evaluate(()=>{const d=__lab.dataset, p=d.manifest.provenance, m=d.matrices.get('siglip.unit');let err=0;for(let i=0;i<m.rows;i++){let s=0;for(let j=0;j<m.cols;j++)s+=m.data[i*m.cols+j]**2;err=Math.max(err,Math.abs(Math.sqrt(s)-1))}return {rows:m.rows,dimensions:m.cols,finite:m.data.every(Number.isFinite),maxNormError:err,device:p.backend,dtype:p.dtype,duplicates:p.duplicatesRemoved,elapsedSeconds:p.elapsedSeconds}});
 if(out.encoder.rows!==24||!out.encoder.finite||out.encoder.maxNormError>1e-6)throw new Error('Encoder verification failed');
 await page.getByRole('button',{name:/^Uncertainty Explorer/}).click();
 await page.getByText('Change the question',{exact:true}).click();
 await page.getByLabel('Audit question',{exact:true}).fill('Select every image containing a weapon.');
 await page.getByRole('button',{name:'Use this question',exact:true}).click();
 const gold={"06137e8e-b256-5051-a514-0700b5614a00.jpg": 0, "0eb89660-d492-58ec-a9b5-2c30e3d247fe.jpg": 0, "029612b5-c7e8-516b-b797-c11e2b3a8549.jpg": 0, "00db07ae-c2ef-5d89-b992-607a17681c5d.jpg": 0, "01be29d3-09f4-593a-96aa-1894a7b344b1.jpg": 0, "00fa0ee4-a373-5457-bb43-4dee6d5ea403.jpg": 0, "003eb2cc-4772-5846-9457-ddcd21042985.jpg": 0, "00ce3670-637f-57a9-8d40-b0af3ca5ff1f.jpg": 0, "003d3702-16de-5465-88c6-87df4587c087.jpg": 0, "029b5806-0286-5e20-a939-e09cac0948b1.jpg": 0, "04449bf6-f55e-5e7b-84a0-c0f0fefdac13.jpg": 0, "10490ab9-9168-5648-9b97-a8e60a10caa3.jpg": 0, "00ccd744-71f2-53f4-95d5-f1c183bb72ba.jpg": 1, "00fb6740-7b44-5678-a045-b5afa61a9b4e.jpg": 1, "010060ff-80aa-583d-a248-c833c68114fb.jpg": 1, "03da9274-8642-5f0c-a014-d577c2a46aed.jpg": 1, "06abf811-409c-5ff7-bd7e-4f6ea1c9bb49.jpg": 1, "00e602fa-607f-5fe9-8faa-ee58d21c2dc8.jpg": 1, "016f0423-a8b2-5da0-b41c-34b197d1c593.jpg": 1, "11e08dc7-ddf9-5780-860c-ad364aa98b7f.jpg": 1, "0982438d-baa6-5488-bfcb-ea08e677bc52.jpg": 1, "076208f1-29cb-5e58-8744-2ae355d57c4f.jpg": 1, "0c45e1ed-1848-5fe0-9728-ceed33fc4197.jpg": 1, "000e3922-eddb-5bd5-a84f-a8478d784443.jpg": 1};
 for(let round=0;round<4;round++){
   await page.locator('.captcha-grid img').first().waitFor();
   const names=await page.locator('.captcha-grid img').evaluateAll(imgs=>imgs.map(img=>window.__lab.dataset.manifest.items.find(i=>i.media===img.src).name));
   for(let j=0;j<names.length;j++)if(gold[names[j]]===1)await page.getByRole('button',{name:'Audit image '+(j+1),exact:true}).click();
   await page.getByRole('button',{name:'Submit batch',exact:true}).click();
 }
 out.audit=await page.evaluate(()=>{const batches=Object.entries(localStorage).filter(([k])=>k.startsWith('semantic-instruments:audit:')&&k.includes(__lab.dataset.manifest.id)).map(([k,v])=>JSON.parse(v)).find(xs=>xs.length===4);return {batches:batches.length,reviewed:batches.reduce((s,b)=>s+b.ids.length,0),positives:batches.reduce((s,b)=>s+b.positives,0),distinct:new Set(batches.flatMap(b=>b.ids)).size}});
 if(out.audit.reviewed!==24||out.audit.distinct!==24||out.audit.positives!==12)throw new Error('Audit identity/count mismatch');
 await page.getByRole('button',{name:'Use 24 individual labels for a toy model',exact:true}).click();
 await page.getByRole('button',{name:'Load your dataset',exact:true}).click();
 await page.getByRole('button',{name:'Fit an explainable linear probe',exact:true}).click();
 await page.waitForFunction(()=>__lab.dataset.manifest.model && !__lab.busy,{}, {timeout:60000});
 out.probe=await page.evaluate(()=>{const p=__lab.dataset.manifest.provenance.browserProbe;return {training:p.trainingRecords,holdout:p.holdoutRecords,initialLoss:p.losses[0],finalLoss:p.losses.at(-1),replayError:__lab.runtime.error,labels:__lab.dataset.manifest.items.filter(i=>i.label!=null).length}});
 await page.screenshot({path:'output/playwright/images-to-toy-model.png'});
 await page.getByRole('button',{name:'Load your dataset',exact:true}).click();
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export this dataset package',exact:true}).click();const download=await event;await download.saveAs('output/playwright/image-toy-model.silab');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('input[accept=".json,.zip,.silab,.parquet"]').setInputFiles('output/playwright/image-toy-model.silab');
 await page.waitForFunction(()=>!__lab.busy,{}, {timeout:60000});
 out.roundtrip=await page.evaluate(()=>({rows:__lab.dataset.manifest.items.length,labels:__lab.dataset.manifest.items.filter(i=>i.label!=null).length,replayError:__lab.runtime.error,media:__lab.dataset.manifest.items.filter(i=>i.media).length}));
 out.errors=errors;out.alerts=await page.locator('[role=alert]').allTextContents();return out;
}