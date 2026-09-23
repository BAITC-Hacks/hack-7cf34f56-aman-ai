import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const output = resolve('qa')
mkdirSync(output, { recursive: true })
const client = new Client({ name: 'moneygraph-analyst-qa', version: '1.0' })
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--executable-path', chromium.executablePath(), '--output-dir', output] })
try {
  await client.connect(transport)
  const tool = (await client.listTools()).tools.find(t => /^browser_run_code/.test(t.name))
  const result = await client.callTool({ name: tool.name, arguments: { code: `async (page) => {
    const passed = []; const errors = []; const bodies = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
    const assert=(ok,text)=>{if(!ok)throw new Error(text);passed.push(text);};
    const gid='900000000000100001';
    await page.setViewportSize({width:1440,height:900});
    await page.route('**/api/agent/status', route=>route.fulfill({json:{available:true,reviewerAvailable:true,dataMode:'demo'}}));
    await page.goto('http://127.0.0.1:5173/');
    await page.getByRole('button',{name:'Открыть первый приоритет'}).click();
    await page.locator('.react-flow__node').first().waitFor();
    const positions=await page.locator('.react-flow__node').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-id'),x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
    const selected=positions.find(n=>n.id===gid);
    assert(positions.filter(n=>n.x<selected.x).length===3 && positions.filter(n=>n.x>selected.x).length===2,'Senders left, selection center, recipients right');
    assert(positions.every((a,i)=>positions.every((b,j)=>i===j||a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)),'Graph node cards do not overlap');
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Скачать список приоритетов'}).click();
    assert((await download).suggestedFilename()==='demo-top-nodes.csv','Demo priority CSV explicitly labeled');
    await page.getByRole('tab',{name:'Переводы',exact:true}).click();
    assert(await page.locator('.transfer-table tbody tr').count()===10,'Transfer table retains every loaded edge, including hidden diagram neighbors');
    const transferDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'CSV связей'}).click();
    assert((await transferDownload).suggestedFilename()==='observed-transfers.csv','Observed transfers export');
    await page.getByRole('tab',{name:'Схема',exact:true}).click();
    await page.getByRole('button',{name:'Объяснить с AI'}).click();
    const question=page.getByRole('textbox',{name:'Вопрос аналитику AI'});
    assert((await question.inputValue()).includes('Объясни роль'),'Explain action prefills question without automatic external request');
    let mode='success';let release; const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/api/agent/chat',async route=>{
      const body=route.request().postDataJSON();bodies.push(body);
      if(mode==='delay')await gate;
      if(mode==='error'){await route.fulfill({status:503,json:{error:'AI-сервис временно недоступен'}});return;}
      if(mode==='cancel'){await page.waitForTimeout(300);await route.abort().catch(()=>{});return;}
      await route.fulfill({json:{answer:'В демо у клиента [gid:900000000000100001] 7 отправителей. Гипотеза требует проверки.',dataMode:'demo',sources:[{gid,label:'Карточка клиента'}],trace:[{tool:'get_node',status:'completed'}],review:{status:body.review?'completed':'not_requested',text:body.review?'Ограничения выборки учтены.':null}}});
    });
    await page.getByRole('combobox',{name:'Проверка выводов NVIDIA'}).click();
    await page.getByRole('option',{name:'OpenAI + проверка NVIDIA'}).click();
    await page.getByRole('button',{name:'Отправить вопрос'}).click();
    await page.getByText('Второе мнение · NVIDIA',{exact:true}).waitFor();
    assert(bodies[0].selectedGid===gid && bodies[0].review && !('facts' in bodies[0]),'Only question, selected string ID, history and review preference sent');
    await page.screenshot({animations:'disabled',path:${JSON.stringify(resolve('qa/analyst-chat-desktop.png'))}});
    await page.getByRole('button',{name:'Открыть источник '+gid}).click();
    await page.locator('.node-gid').waitFor();
    assert(await page.locator('.node-gid').textContent()===gid,'Evidence source opens corresponding inspector');
    await page.getByRole('tab',{name:'AI-помощник',exact:true}).click();
    assert(await page.getByText('Второе мнение · NVIDIA',{exact:true}).isVisible(),'Conversation survives switching between inspector and chat');
    await question.fill('Что проверить дальше?');mode='delay';
    await page.getByRole('button',{name:'Отправить вопрос'}).click();
    await page.getByRole('button',{name:'Остановить ответ'}).waitFor();
    assert(await question.isDisabled(),'Chat loading state prevents duplicate requests');release();
    await page.getByRole('button',{name:'Отправить вопрос'}).waitFor();
    assert(bodies[1].history.length===2,'Follow-up request includes prior conversation');
    mode='error';await question.fill('Проверка ошибки');await page.getByRole('button',{name:'Отправить вопрос'}).click();
    await page.getByRole('button',{name:'Повторить вопрос'}).waitFor();mode='success';await page.getByRole('button',{name:'Повторить вопрос'}).click();
    await page.getByRole('button',{name:'Отправить вопрос'}).waitFor();
    assert(await page.getByRole('button',{name:'Повторить вопрос'}).count()===0,'Chat error and retry recover without duplicating the question');
    mode='cancel';await question.fill('Остановить проверку');await page.getByRole('button',{name:'Отправить вопрос'}).click();await page.getByRole('button',{name:'Остановить ответ'}).click();
    await page.getByText('Запрос остановлен',{exact:true}).waitFor();passed.push('Request cancellation returns composer to usable state');
    await page.getByRole('button',{name:'Новый диалог'}).click();
    await page.getByText('Что хотите выяснить?',{exact:true}).waitFor();passed.push('New conversation clears history');
    mode='success';await question.fill('Сохрани этот диалог');await page.getByRole('button',{name:'Отправить вопрос'}).click();await page.getByText('Второе мнение · NVIDIA',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'AI-помощник',exact:true}).click();
    await page.getByRole('dialog').waitFor();await page.getByRole('textbox',{name:'Вопрос аналитику AI'}).waitFor();
    assert(await page.getByText('Сохрани этот диалог',{exact:true}).count()===1,'Conversation survives viewport changes');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile chat has no horizontal page overflow');
    await page.screenshot({animations:'disabled',path:${JSON.stringify(resolve('qa/analyst-chat-mobile.png'))}});
    await page.getByRole('button',{name:'Close',exact:true}).click();
    assert(await page.getByRole('button',{name:'AI-помощник',exact:true}).evaluate(el=>el===document.activeElement),'Mobile chat restores focus to opener');
    await page.getByRole('button',{name:'AI-помощник',exact:true}).click();await page.getByRole('dialog').waitFor();
    assert(await page.getByText('Сохрани этот диалог',{exact:true}).count()===1,'Conversation survives closing and reopening the mobile panel');
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.setViewportSize({width:1440,height:900});
    await page.unroute('**/api/agent/status');await page.route('**/api/agent/status',route=>route.fulfill({json:{available:false,reviewerAvailable:false,dataMode:'demo'}}));
    await page.reload();await page.getByRole('tab',{name:'AI-помощник',exact:true}).click();
    await page.getByText('Ассистент не подключён',{exact:true}).waitFor();
    assert(await page.getByRole('button',{name:'Отправить вопрос'}).isDisabled(),'Missing credentials produce explicit unavailable state');
    await page.getByRole('tab',{name:'3. Проверка клиента',exact:true}).click();await page.locator('.node-gid').waitFor();
    passed.push('Deterministic inspection works with AI unavailable');
    assert(errors.filter(s=>!s.includes('503')).length===0,'No unexpected browser errors: '+JSON.stringify(errors));
    return {passed,source:'synthetic fixture + intercepted agent API',expected503:true};
  }` } }, undefined, { timeout: 60000 })
  writeFileSync(resolve(output,'analyst-report.json'),JSON.stringify(result,null,2))
  console.log(result.content?.[0]?.text?.split('### Ran')[0])
  if(result.isError)process.exitCode=1
} finally {await client.close()}
