import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const output = resolve('qa')
mkdirSync(output, { recursive: true })
const client = new Client({ name: 'moneygraph-api-qa', version: '1.0' })
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('node_modules/@playwright/mcp/cli.js'),'--headless','--isolated','--executable-path',chromium.executablePath(),'--output-dir',output]}))
  const tool=(await client.listTools()).tools.find(t=>/^browser_run_code/.test(t.name))
  const result=await client.callTool({name:tool.name,arguments:{code:`async (page) => {
    const passed = []; const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    const assert=(ok,msg)=>{if(!ok)throw new Error(msg);passed.push(msg)};
    const fixture=await (await page.request.get('http://127.0.0.1:5173/demo.json')).json();
    let delayA=false, release; const gate=new Promise(resolve=>{release=resolve});
    await page.route('**/api/**',async route=>{
      const path=route.request().url().split('/api/')[1];
      if(path==='top-nodes') return route.fulfill({json:fixture.top});
      if(path.startsWith('nodes/')) {
        const gid=path.split('/')[1]; const node=fixture.nodes.find(n=>n.gid===gid);
        if(!node)return route.fulfill({status:404,json:{error:'not found'}});
        if(delayA && gid===fixture.nodes[0].gid && !path.includes('subgraph'))await gate;
        if(path.includes('subgraph'))return route.fulfill({json:{nodes:fixture.nodes,edges:fixture.edges,coverage:{truncated:false,total_nodes:26,total_edges:fixture.edges.length,limit:250}}});
        return route.fulfill({json:node});
      }
      if(path.startsWith('search')) {
        const gid=path.split('gid=')[1]; return route.fulfill(fixture.nodes.some(n=>n.gid===gid)?{json:{gid}}:{status:404,json:{error:'not found'}});
      }
      return route.fulfill({status:500,json:{error:'unexpected route'}});
    });
    await page.setViewportSize({width:1440,height:900});
    await page.goto('http://127.0.0.1:5174/');
    await page.getByText('Данные анализа',{exact:true}).waitFor();
    assert(await page.getByText('Демонстрационные данные',{exact:true}).count()===0,'API mode does not silently show demo mode');
    delayA=true;
    await page.getByRole('button',{name:'Открыть клиент 900000000000100001'}).click();
    await page.locator('.inspector').getByRole('status',{name:'Загрузка данных'}).waitFor();
    await page.getByRole('button',{name:'Открыть клиент 900000000000100002'}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100002'}).waitFor();
    release();
    await page.waitForTimeout(200);
    assert(await page.locator('.node-gid').textContent()==='900000000000100002','Late A response cannot overwrite B');
    assert(await page.locator('.inspector').getByText(/Входящие переводы seed-клиента неполны/).isVisible(),'B data matches its identity after race');
    await page.getByRole('textbox',{name:'Поиск по gid'}).fill('123');
    await page.getByRole('button',{name:'Найти',exact:true}).click();
    await page.getByText('Клиент не найден',{exact:true}).waitFor();
    assert(await page.locator('.node-gid').textContent()==='900000000000100002','API 404 preserves previous valid selection');
    await page.goto('http://127.0.0.1:5174/?gid=900000000000100023&hop=2');
    await page.locator('.node-gid').filter({hasText:'900000000000100023'}).waitFor();
    assert(await page.getByText(/Граница наблюдения · глубина 4/).isVisible(),'Direct link restores exact ID and boundary notice');
    await page.setViewportSize({width:720,height:450});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'200%-equivalent viewport has no horizontal overflow');
    assert(errors.length===0,'No API-mode runtime errors');
    return {passed,errors,dataSource:'intercepted synthetic API, not real backend'};
  }`}},undefined,{timeout:60000})
  writeFileSync(resolve(output,'api-browser-report.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2));if(result.isError)process.exitCode=1
}finally{await client.close()}
