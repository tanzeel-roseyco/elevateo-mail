const { chromium, expect } = require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const [size,viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) for(const theme of ['light','dark']) {
 const ctx=await browser.newContext({viewport,colorScheme:theme}); const p=await ctx.newPage(); p.setDefaultTimeout(20000);
 await p.goto('http://localhost:4174'); await p.getByRole('button',{name:'Continue as synthetic user alice'}).click(); await expect(p.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();
 const shot=async(name)=>{const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); if(overflow>0)throw Error(name+' overflow '+overflow);await p.screenshot({path:`/shots/${size}-${theme}-${name}.png`,fullPage:true});console.log(size,theme,name,'overflow',overflow)};
 await p.goto('http://localhost:4174/search');await p.getByLabel('Subject or sender').fill('invoice');await p.getByRole('button',{name:'Search newest messages'}).click();await expect(p.getByRole('region',{name:'Search results'})).toBeVisible();await shot('search');
 await p.goto('http://localhost:4174/connections/enrichment');await expect(p.getByText('No active Hunter key.',{exact:true})).toBeVisible();await shot('hunter');
 await p.goto('http://localhost:4174/campaigns'); await expect(p.getByLabel('New campaign ID')).toBeVisible();
 const campaign=p.getByRole('button',{name:'visual-qa-draft',exact:true});
 if(await campaign.count())await campaign.click();else{await p.getByLabel('New campaign ID').fill('visual-qa-draft');await p.getByRole('button',{name:'Create campaign'}).click()}
 const seq=p.getByRole('region',{name:'Campaign sequences'});await expect(seq).toBeVisible();await seq.scrollIntoViewIfNeeded();const bounds=await seq.getByRole('button',{name:'Save sequence for review'}).boundingBox();expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);await shot('sequence');
 await p.goto('http://localhost:4174/mail/alice-main/msg-119');await expect(p.getByRole('button',{name:'Reply',exact:true})).toBeEnabled();await p.getByRole('button',{name:'Reply',exact:true}).click();await expect(p.getByRole('heading',{name:'This message cannot be replied to'})).toBeVisible();await shot('reply-unavailable');
 await p.goto('http://localhost:4174/assistant');await p.getByLabel('Mailbox',{exact:true}).selectOption('alice-main');await expect(p).toHaveTitle('AI Assistant · Elevateo Mail');await shot('assistant'); await ctx.close();
 }await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
