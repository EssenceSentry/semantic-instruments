async (page) => {
 await page.goto('http://127.0.0.1:8773/');await page.waitForFunction(()=>window.__lab?.dataset&&!__lab.busy,{}, {timeout:60000});
 await page.getByRole('button',{name:'Load your dataset',exact:true}).click();
 await page.getByLabel('Local images',{exact:true}).setInputFiles(['public/media/06137e8e-b256-5051-a514-0700b5614a00.jpg','public/media/00ccd744-71f2-53f4-95d5-f1c183bb72ba.jpg']);
 await page.getByLabel('Encoder device',{exact:true}).selectOption('auto');
 await page.getByRole('button',{name:'Compute embeddings',exact:true}).click();
 await page.waitForFunction(()=>window.__lab.dataset.manifest.id.startsWith('local-images-')&&!__lab.busy,{}, {timeout:60000});
 return await page.evaluate(()=>{const d=__lab.dataset;return {rows:d.manifest.items.length,backend:d.manifest.provenance.backend,dtype:d.manifest.provenance.dtype,fallback:d.manifest.provenance.fallback,seconds:d.manifest.provenance.elapsedSeconds,finite:d.matrices.get('siglip.unit').data.every(Number.isFinite),pcaCols:d.positions.get('siglip.unit').cols,rotationDisabled:document.querySelector('[aria-label="Rotate projection camera"]').disabled}});
}
