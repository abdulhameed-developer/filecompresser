/** Native number-field readability, focus and fixed-viewport wheel-lock audit.
 * Generated fixture only. Native keys; no app value/event/style injection.
 */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const qa=createRequire(path.resolve(process.env.PW_TOOLS||'.qa-results/phase2/qa-tools','qa.cjs'))
const kind=process.env.TEST_BROWSER||'chromium'
const [base,directory,expectedHome]=process.argv.slice(2)
assert(base&&directory&&expectedHome&&['chromium','firefox','webkit'].includes(kind))
const out=path.resolve(directory);assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true})
const hash=x=>createHash('sha256').update(x).digest('hex')
const fixtureFile=path.resolve('.qa-results/phase2/image-lab/inputs/screenshot-optimized.png')
const fixture=JSON.parse(fs.readFileSync('.qa-results/phase2/image-lab/manifest.json')).fixtures.find(x=>x.file===path.basename(fixtureFile));assert.equal(hash(fs.readFileSync(fixtureFile)),fixture.sha256)
const widths=[320,375,390,430,480,481,768],drafts=[['100.05',100050],['199999.999',199999999]]
const report={startedAt:new Date().toISOString(),base,kind,expectedHome,fixture,widths,drafts,scope:'Source and genuinely completed/applied PNG settings. Native keys at seven widths (320 at568px height), exact raw draft/byte summary, measured text capacity, full active focus frame, complete invalid draft/error/ring/reopen recovery through native panel wheel when needed, same-active-control844x390 orientation, native backdrop wheel lock at a settled viewport and exact Escape/focus return. Across-responsive scrollY changes are recorded rather than asserted; native anchoring qualification remains separate. No physical/virtual keyboard certification.',states:[],resizes:[],invalidStates:[],wheelControls:[],closeReturns:[],downloads:[],failures:[],pageErrors:[],consoleMessages:[],failedRequests:[],status:'RUNNING',harnessSha256Before:hash(fs.readFileSync(new URL(import.meta.url)))}
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n')
const identity=async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);return hash(await r.text())}
let browser,page
const paint=async()=>{await page.evaluate(()=>new Promise(resolve=>{let n=0;const tick=()=>++n>=6?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick)}));await page.waitForTimeout(75)}
const inspect=field=>field.evaluate(input=>{
 const frame=input.closest('.numberField'),body=input.closest('.settingsDialogBody'),footer=input.closest('dialog').querySelector('.settingsDialogFooter'),s=getComputedStyle(input),f=getComputedStyle(frame),rect=e=>{const x=e.getBoundingClientRect();return{top:x.top,bottom:x.bottom,left:x.left,right:x.right,width:x.width,height:x.height}}
 const status=input.closest('.targetCustomRow').querySelector('.exactTarget'),statusRect=rect(status)
 const box=rect(frame),port=rect(body),foot=rect(footer),clearance=8+(parseFloat(f.outlineWidth)||0)+Math.max(0,parseFloat(f.outlineOffset)||0)
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font||`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
 const spacing=parseFloat(s.letterSpacing)||0,textWidth=ctx.measureText(input.value).width+spacing*Math.max(0,input.value.length-1),padding=(parseFloat(s.paddingLeft)||0)+(parseFloat(s.paddingRight)||0),availableTextWidth=input.clientWidth-padding
 const described=(input.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean).map(id=>({id,text:document.getElementById(id)?.textContent?.trim()||'',exists:!!document.getElementById(id)}))
 return{statusRect,statusText:status.textContent.trim(),fullErrorSummaryExposed:statusRect.top>=port.top+clearance-1&&statusRect.bottom<=port.bottom-clearance+1,value:input.value,actualFocus:document.activeElement===input,viewport:[innerWidth,innerHeight],page:[scrollX,scrollY],frame:box,input:rect(input),body:{...port,scrollTop:body.scrollTop},footer:foot,clearance,wholeFocusFrameExposed:box.top>=port.top+clearance-1&&box.bottom<=port.bottom-clearance+1&&box.bottom<=foot.top-clearance+1,documentWidth:document.documentElement.scrollWidth,clientWidth:input.clientWidth,padding,textWidth,availableTextWidth,textFits:textWidth+2<=availableTextWidth,font:s.font,appearance:s.appearance,innerBorder:[s.borderLeftWidth,s.borderRightWidth],outlineColor:f.outlineColor,statusColor:getComputedStyle(input.closest('.targetCustomRow').querySelector('.exactTarget')).color,ariaInvalid:input.getAttribute('aria-invalid'),described}
})
async function type(field,value){await field.click();await field.press('ControlOrMeta+A');await field.press('Backspace');await field.pressSequentially(value);await paint();assert.equal(await field.inputValue(),value)}
async function close(dialog,shortcut,bookmark,label){await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await paint();const r=await shortcut.evaluate(b=>({focus:document.activeElement===b,page:[scrollX,scrollY]}));assert(r.focus);assert.deepEqual(r.page,bookmark);report.closeReturns.push({label,bookmark,...r,passed:true});save()}
try{
 report.homeBefore=await identity();assert.equal(report.homeBefore,expectedHome)
 browser=await qa('playwright-core')[kind].launch({headless:true,executablePath:process.env.TEST_BROWSER_PATH||(kind==='chromium'?'/usr/bin/google-chrome':undefined),...(process.env.TEST_BROWSER_CHANNEL?{channel:process.env.TEST_BROWSER_CHANNEL}:{})});report.browserVersion=browser.version();report.playwrightVersion=qa('playwright-core/package.json').version
 page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});page.on('pageerror',e=>report.pageErrors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))report.consoleMessages.push({type:m.type(),text:m.text()})});page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),failure:r.failure()}))
 await page.goto(base+'/png-compressor',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.locator('input[type=file]').setInputFiles(fixtureFile);await page.locator('.compressBtn:not([disabled])').waitFor()
 const shortcut=page.locator('.workflowSettingsShortcut'),dialog=page.getByRole('dialog',{name:'Settings',exact:true}),field=page.getByLabel('Custom maximum (KB)',{exact:true})
 for(const phase of ['source-only','applied-result']){
  await page.setViewportSize({width:1440,height:900});await shortcut.scrollIntoViewIfNeeded();await paint();let bookmark=await page.evaluate(()=>[scrollX,scrollY]);await shortcut.click();await dialog.waitFor();await page.getByRole('button',{name:'Target size',exact:true}).click();await page.getByRole('button',{name:'100 KB',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Restore applied',exact:true}).isVisible(),phase==='applied-result')
  for(const width of widths){
   await page.setViewportSize({width,height:width===320?568:900});await paint()
   for(const[value,bytes]of drafts){
    await type(field,value);const state=await inspect(field),summary=(await page.locator('.exactTarget').innerText()).replace(/\s+/g,' ').trim();const checks={value:state.value===value,focus:state.actualFocus,fullFrame:state.wholeFocusFrameExposed,textCapacity:state.textFits,exactBytes:summary===`${bytes.toLocaleString('en-US')} bytes maximum`,valid:state.ariaInvalid!=='true',noHorizontalOverflow:state.documentWidth<=width+1}
    const screenshot=path.join(out,`${phase}-${width}-${value.replace('.','_')}.png`);await page.screenshot({path:screenshot});const row={phase,width,expectedDraft:value,expectedBytes:bytes,summary,...state,checks,screenshot,screenshotSha256:hash(fs.readFileSync(screenshot)),passed:Object.values(checks).every(Boolean)};report.states.push(row);if(!row.passed)report.failures.push({phase,width,value,failedChecks:Object.keys(checks).filter(k=>!checks[k])});save()
   }
   if(width===320&&phase==='source-only'){
    await type(field,'100.0005');let invalid=await inspect(field)
    // Reveal the adjacent validation text through actual native panel wheel input.
    // The original failed coordinates remain in the observation if it cannot fit.
    const nativeErrorReveal=[]
    for(let attempt=0;attempt<3&&!invalid.fullErrorSummaryExposed;attempt++){
     const delta=invalid.statusRect.bottom>invalid.body.bottom-invalid.clearance?Math.ceil(invalid.statusRect.bottom-invalid.body.bottom+invalid.clearance):Math.floor(invalid.statusRect.top-invalid.body.top-invalid.clearance)
     const point=[Math.min(invalid.body.right-10,Math.max(invalid.body.left+10,invalid.frame.right+8)),(invalid.body.top+invalid.body.bottom)/2]
     await page.mouse.move(...point);if(kind==='firefox')await page.waitForTimeout(1700);await page.mouse.wheel(0,delta);await page.waitForTimeout(250);await paint();nativeErrorReveal.push({point,delta});invalid=await inspect(field)
    }
    assert.equal(invalid.value,'100.0005');assert.equal(invalid.ariaInvalid,'true');assert(invalid.described.every(x=>x.exists));assert(invalid.described.some(x=>/whole bytes/.test(x.text)));assert.equal(invalid.outlineColor,invalid.statusColor)
    const screenshot=path.join(out,'invalid-320-100_0005.png');await page.screenshot({path:screenshot});const invalidChecks={focus:invalid.actualFocus,fullFrame:invalid.wholeFocusFrameExposed,textCapacity:invalid.textFits,errorSummaryVisible:invalid.fullErrorSummaryExposed};const invalidPassed=Object.values(invalidChecks).every(Boolean);report.invalidStates.push({name:'native-invalid-draft',...invalid,nativeErrorReveal,checks:invalidChecks,screenshot,screenshotSha256:hash(fs.readFileSync(screenshot)),passed:invalidPassed});if(!invalidPassed)report.failures.push({phase,width,value:'100.0005',failedChecks:Object.keys(invalidChecks).filter(k=>!invalidChecks[k])});await close(dialog,shortcut,bookmark,'invalid-close');assert.equal(await page.locator('.compressBtn').isDisabled(),true)
    await shortcut.scrollIntoViewIfNeeded();await paint();bookmark=await page.evaluate(()=>[scrollX,scrollY]);await shortcut.click();await dialog.waitFor();assert.equal(await field.inputValue(),'100.0005');assert.equal(await field.getAttribute('aria-invalid'),'true');report.invalidStates.push({name:'invalid-reopen-preserved',value:await field.inputValue(),processingDisabled:true,passed:true});await type(field,'100.05');assert.notEqual(await field.getAttribute('aria-invalid'),'true')
   }
   if(width===320){
    const before=await page.evaluate(()=>[scrollX,scrollY]);const bounds=await dialog.boundingBox();assert(bounds&&bounds.x>1);const rows=[];const pointY=width===320?284:450;await page.mouse.move(1,pointY)
    for(const delta of [500,-500]){if(kind==='firefox')await page.waitForTimeout(1700);await page.mouse.wheel(0,delta);await page.waitForTimeout(175);const after=await page.evaluate(()=>[scrollX,scrollY]);assert.deepEqual(after,before);rows.push({delta,after})}
    report.wheelControls.push({phase,width,point:[1,pointY],before,actions:rows,passed:true});save()
   }
  }
  // Orientation changes retain the same native active control and its exact draft.
  await page.setViewportSize({width:844,height:390});await paint();const orientation=await inspect(field);const orientationChecks={focus:orientation.actualFocus,fullFrame:orientation.wholeFocusFrameExposed,value:orientation.value==='199999.999',textCapacity:orientation.textFits,noHorizontalOverflow:orientation.documentWidth<=845};const orientationScreenshot=path.join(out,phase+'-same-active-844x390.png');await page.screenshot({path:orientationScreenshot});const orientationPassed=Object.values(orientationChecks).every(Boolean);report.resizes.push({phase,...orientation,checks:orientationChecks,passed:orientationPassed,screenshot:orientationScreenshot,screenshotSha256:hash(fs.readFileSync(orientationScreenshot))});if(!orientationPassed)report.failures.push({phase,width:844,value:'199999.999',name:'same-active-orientation',failedChecks:Object.keys(orientationChecks).filter(k=>!orientationChecks[k])});save()
  await close(dialog,shortcut,bookmark,phase+'-close')
  if(phase==='source-only'){
   await shortcut.click();await dialog.waitFor();await page.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Lossless',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Done',exact:true}).click();await page.locator('.compressBtn:not([disabled])').click();await page.locator('.file.status-completed').waitFor({timeout:120000})
   const[download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download file',exact:true}).click()]);const file=path.join(out,'actual-default-lossless.png');await download.saveAs(file);const bytes=fs.readFileSync(file);assert.equal(bytes.length,83020);assert.equal(hash(bytes),'67181c1d03a5e42876abcf23d312ac169442bfb0c4af29261142a0d601143e7e')
   const decoded=JSON.parse(execFileSync('python3',['-c',"from PIL import Image;import json,sys;a=Image.open(sys.argv[1]);a.load();b=Image.open(sys.argv[2]);b.load();print(json.dumps({'format':b.format,'dimensions':b.size,'pixelsEqual':a.convert('RGBA').tobytes()==b.convert('RGBA').tobytes()}))",fixtureFile,file],{encoding:'utf8'}));assert.deepEqual(decoded,{format:'PNG',dimensions:[1440,900],pixelsEqual:true});report.downloads.push({file,bytes:bytes.length,sha256:hash(bytes),decoded});save()
  }
 }
 report.homeAfter=await identity();assert.equal(report.homeAfter,expectedHome);assert.equal(report.states.length,28);assert.equal(report.resizes.length,2);assert.equal(report.invalidStates.length,2);assert.equal(report.wheelControls.length,2);assert.equal(report.closeReturns.length,3);assert.equal(report.pageErrors.length,0);assert.equal(report.consoleMessages.length,0);assert.equal(report.failedRequests.length,0);assert.equal(report.failures.length,0,'Every native numeric draft must fit its actual text content area and preserve focus/geometry/bytes');report.status='PASS_NATIVE_NUMBER_READABILITY'
}catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1}
finally{if(browser){await browser.close();report.closedNormally=true}report.harnessSha256After=hash(fs.readFileSync(new URL(import.meta.url)));assert.equal(report.harnessSha256After,report.harnessSha256Before);report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,kind,states:report.states.length,failures:report.failures.length,failure:report.failure}))}
