import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const baseUrl=process.env.QA_BASE_URL||'http://127.0.0.1:5173/'
if(!['localhost','127.0.0.1'].includes(new URL(baseUrl).hostname))throw new Error('QA requires a local server')
mkdirSync('qa',{recursive:true})
const client=new Client({name:'moneygraph-project-qa',version:'1.0'})
try {
 await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('node_modules/@playwright/mcp/cli.js'),'--headless','--isolated','--executable-path',chromium.executablePath(),'--output-dir',resolve('qa')]}))
 const tool=(await client.listTools()).tools.find(t=>/^browser_run_code/.test(t.name))
 const scenario=async (page,base) => {
  const passed=[],errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>requests.push(r.url()));
  const assert=(ok,label)=>{if(!ok)throw new Error(label);passed.push(label)};
  const fixture=await (await page.request.get(base.replace(/\/$/,'')+'/project-data.json')).json();
  assert(fixture.metadata.source==='project','Authoritative project provenance');
  assert(fixture.nodes.length===2248&&fixture.edges.length===3119&&fixture.clusters.length===65,'Real dataset counts');
  assert(fixture.top[0].gid==='100000003115284100'&&fixture.top[0].priority_score===.862398,'Real CSV Top1 score');
  await page.setViewportSize({width:1440,height:900});await page.goto(base);await page.locator('.aml-canvas[data-settled=true]').waitFor();
  assert(await page.locator('.aml-canvas').getAttribute('data-node-count')==='2248','Full real network on first load');
  assert(await page.locator('.aml-canvas').getAttribute('data-link-count')==='3119','Full canonical directed links');
  assert(!requests.some(url=>url.includes('/demo.json')||url.includes('/api/top-nodes')||url.includes('/api/nodes/')),'Project mode never fetches demo or invented API');
  assert(await page.locator('.header-status').innerText()==='Данные проекта','Real data label');
  assert(await page.getByRole('textbox',{name:'Поиск по gid'}).getAttribute('placeholder')==='GID','Concise GID input');
  await page.waitForTimeout(650);await page.screenshot({path:'qa/project-1440.png'});
  const top=fixture.top[0],card=fixture.nodes.find(n=>n.gid===top.gid);
  await page.getByRole('button',{name:'Открыть клиента '+top.gid}).click();await page.locator('.node-gid').filter({hasText:top.gid}).waitFor();
  assert(await page.locator('.inspector .evidence-text').first().innerText()===card.evidence,'Inspector uses exact CSV evidence');
  const format=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n);
  const flow=await page.locator('.inspector .flow-number').allTextContents();assert(flow[0].includes(format(card.observed_flows.incoming_kzt))&&flow[1].includes(format(card.observed_flows.outgoing_kzt)),'Inspector flows match complete canonical edges');
  await page.getByRole('tab',{name:'Основания',exact:true}).click();await page.getByText('Источник содержит итоговый приоритет без разбивки по компонентам.').waitFor();passed.push('Missing priority components explicitly unavailable');
  await page.getByRole('button',{name:'Кластер '+card.cluster_id,exact:true}).click();await page.locator('.aml-cluster-summary').waitFor();
  await page.locator('.aml-cluster-summary').getByText(fixture.clusters.find(c=>c.cluster_id===card.cluster_id).hypothesis.trim(),{exact:true}).waitFor();passed.push('Cluster hypothesis matches CSV');
  await page.getByRole('button',{name:'К графу',exact:true}).click();
  await page.getByRole('radio',{name:'Связи клиента',exact:true}).click();const one=Number(await page.locator('.aml-canvas').getAttribute('data-node-count'));await page.getByRole('radio',{name:'4',exact:true}).click();assert(Number(await page.locator('.aml-canvas').getAttribute('data-node-count'))>=one,'Real 1–4-hop traversal');
  await page.getByRole('button',{name:'Цепочки',exact:true}).click();assert(await page.getByRole('button',{name:'Цепочки',exact:true}).getAttribute('aria-pressed')==='true','Real trace paths');
  const boundary=fixture.nodes.find(n=>n.depth===4&&n.observed_flows.out_degree===0);
  const search=async gid=>{await page.getByRole('textbox',{name:'Поиск по gid'}).fill(gid);await page.getByRole('button',{name:'Найти',exact:true}).click();await page.locator('.node-gid').filter({hasText:gid}).waitFor()};
  await search(boundary.gid);await page.getByText('Граница графа',{exact:true}).waitFor();passed.push('Real boundary warning');
  const seed=fixture.nodes.find(n=>n.is_seed);await search(seed.gid);await page.getByText('Неполные входящие потоки',{exact:true}).waitFor();passed.push('Real seed warning');
  await page.getByRole('textbox',{name:'Поиск по gid'}).fill('1');await page.getByRole('button',{name:'Найти',exact:true}).click();await page.getByText('Клиент не найден',{exact:true}).waitFor();assert(await page.locator('.node-gid').innerText()===seed.gid,'Unknown GID retains selection');
  await page.getByRole('button',{name:'Снять выбор клиента'}).click();await page.getByRole('button',{name:'Настройки графа',exact:true}).click();await page.getByRole('button',{name:'Топ-20'}).click();assert(await page.locator('.aml-canvas').getAttribute('data-node-count')==='20','Real Top20 filter');
  await page.getByRole('spinbutton',{name:'Наблюдаемый объём от, ₸'}).fill('999999999999999');await page.getByText('Нет совпадений',{exact:true}).waitFor();passed.push('Real filter empty state');
  await page.locator('#graph-settings').getByRole('button',{name:'Сбросить фильтры',exact:true}).click();await page.getByRole('button',{name:'Закрыть настройки графа'}).click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'1440 layout has no overflow');
  await page.setViewportSize({width:1920,height:1080});await page.locator('.aml-canvas[data-settled=true]').waitFor();await page.waitForTimeout(650);await page.screenshot({path:'qa/project-1920.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'1920 layout has no overflow');
  const status=await (await page.request.get(base.replace(/\/$/,'')+'/api/agent/status')).json();assert(status.dataMode==='project','Assistant server uses same project source');
  await page.getByRole('button',{name:'AI-помощник',exact:true}).click();assert(await page.getByRole('textbox',{name:'Вопрос аналитику AI'}).getAttribute('placeholder')==='Задайте вопрос…','Concise chat placeholder');
  assert(errors.length===0,'No errors in real data workflows');
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/project-data.json',async route=>{await gate;await route.continue()});await page.goto(base);await page.getByRole('status',{name:'Загрузка данных'}).first().waitFor();release();await page.locator('.aml-canvas').waitFor();await page.unroute('**/project-data.json');passed.push('Project loading state');
  await page.route('**/project-data.json',route=>route.fulfill({json:{nodes:[],edges:[],top:[],clusters:[],metadata:{...fixture.metadata,node_count:0,edge_count:0,transaction_count:0,total_kzt:0}}}));await page.goto(base);await page.getByText('Нет совпадений',{exact:true}).waitFor();await page.unroute('**/project-data.json');passed.push('Empty project response');
  let fail=true;await page.route('**/project-data.json',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.continue());await page.goto(base);await page.locator('.graph-panel').getByText('Не удалось загрузить',{exact:true}).waitFor();fail=false;await page.locator('.graph-panel').getByRole('button',{name:'Повторить',exact:true}).click();await page.locator('.aml-canvas').waitFor();await page.unroute('**/project-data.json');passed.push('Project failure and retry without demo fallback');
  await page.goto(base);await page.locator('.aml-canvas').waitFor();
  assert(errors.every(e=>e.includes('503')),'Only intentional HTTP errors');
  return {passed,expected503:true,nodeCount:fixture.nodes.length,linkCount:fixture.edges.length,clusters:fixture.clusters.length,totalKzt:fixture.metadata.total_kzt};
 }
 const result=await client.callTool({name:tool.name,arguments:{code:`async (page)=>await (${scenario.toString()})(page,${JSON.stringify(baseUrl)})`}},undefined,{timeout:60000})
 writeFileSync('qa/project-browser-report.json',JSON.stringify(result,null,2));
 for(const item of result.content??[])if(item.type==='text')console.log(item.text.split('### Ran')[0]);
 if(result.isError)process.exitCode=1
}finally{await client.close()}
