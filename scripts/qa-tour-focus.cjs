async (page) => {
 const out={};await page.setViewportSize({width:390,height:844});
 await page.keyboard.press('f');await page.locator('.focus-toolbar').waitFor();
 out.mobileFocusEntry=await page.getByRole('button',{name:'Guided tour',exact:true}).isVisible();
 await page.getByRole('button',{name:'Guided tour',exact:true}).click();out.mobileFocusMenu=await page.locator('dialog.tour-menu').isVisible();
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.keyboard.press('f');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Guided tour',exact:true}).click();
 await page.getByRole('button',{name:/Start the full tour|Start again/}).last().click();await page.waitForFunction(()=>__tour.active&&!__tour.preparing);
 await page.screenshot({path:'output/playwright/tour-refined-welcome.png'});
 out.entry={step:await page.locator('.driver-popover').getAttribute('data-tour-step'),variant:await page.evaluate(()=>__tour.variant)};
 await page.keyboard.press('Escape');return out;
}
