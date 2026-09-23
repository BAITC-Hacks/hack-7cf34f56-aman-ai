export default async (page, baseUrl) => {
 await page.addInitScript(()=>{
  window.canvasQA={minRadius:Infinity,maxRadius:0,colors:{},curves:0};
  const proto=CanvasRenderingContext2D.prototype;
  const arc=proto.arc;proto.arc=function(x,y,r,...args){if(this.canvas.isConnected){window.canvasQA.minRadius=Math.min(window.canvasQA.minRadius,r);window.canvasQA.maxRadius=Math.max(window.canvasQA.maxRadius,r)}return arc.call(this,x,y,r,...args)};
  const fill=proto.fill;proto.fill=function(...args){if(this.canvas.isConnected){window.canvasQA.colors[String(this.fillStyle)]=true}return fill.apply(this,args)};
  const curve=proto.quadraticCurveTo;proto.quadraticCurveTo=function(...args){if(this.canvas.isConnected)window.canvasQA.curves++;return curve.apply(this,args)};
 });
 await page.setViewportSize({width:1440,height:900});await page.goto(baseUrl);await page.locator('.aml-canvas[data-settled=true]').waitFor();
 const encoding=await page.evaluate(()=>window.canvasQA);
 const colors=Object.keys(encoding.colors).filter(c=>/^#[0-9a-f]{6}$/i.test(c));
 const rgb=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
 if(!colors.some(c=>{const [r,g,b]=rgb(c);return g>r*1.5&&g>b}))throw new Error('No green fill');
 if(!colors.some(c=>{const [r,g]=rgb(c);return r>g*1.5&&r>180}))throw new Error('No high-priority red fill');
 if(!(encoding.minRadius<=3&&encoding.maxRadius>=17&&encoding.curves>0))throw new Error('Expected sized nodes and curved links');
 await page.getByRole('button',{name:'Открыть клиент 900000000000100001'}).click();await page.locator('.node-gid').waitFor();
 await page.waitForTimeout(750);
 const empty=await page.locator('.aml-canvas canvas').first().evaluate(canvas=>{
  const box=canvas.getBoundingClientRect();const ctx=canvas.getContext('2d');const scale=canvas.width/box.width;
  for(let y=55;y<box.height-70;y+=30)for(let x=35;x<box.width-35;x+=30){
   const pixels=ctx.getImageData(Math.floor((x-10)*scale),Math.floor((y-10)*scale),Math.ceil(20*scale),Math.ceil(20*scale)).data;
   let clear=true;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]!==0&&!(pixels[i]===9&&pixels[i+1]===11&&pixels[i+2]===16)){clear=false;break}
   if(clear)return {x:box.x+x,y:box.y+y};
  }return null;
 });
 if(!empty)throw new Error('No empty canvas area found');await page.mouse.click(empty.x,empty.y);await page.locator('.node-gid').waitFor({state:'detached'});
 await page.locator('.aml-canvas').focus();await page.keyboard.press('+');await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');
 const timings=await page.evaluate(()=>new Promise(resolve=>{const frames=[];let last=performance.now();const draw=now=>{frames.push(now-last);last=now;if(frames.length>=60)resolve({medianMs:frames.sort((a,b)=>a-b)[30],maxMs:Math.max(...frames)});else requestAnimationFrame(draw)};requestAnimationFrame(draw)}));
 return {greenAndRed:true,distinctColors:colors.length,minRadius:encoding.minRadius,maxRadius:encoding.maxRadius,curvedDrawCalls:encoding.curves,backgroundClear:true,keyboardPanZoom:true,timings};
}
