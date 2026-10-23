import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

// Real application components; controlled listings/actions, no Auth, DB or TMDB API calls.
const root = fileURLToPath(new URL("../../", import.meta.url));
const navigation = `import React,{useSyncExternalStore} from 'react';
  const subscribe=callback=>{window.addEventListener('popstate',callback);return()=>window.removeEventListener('popstate',callback)};
  export const useHref=()=>useSyncExternalStore(subscribe,()=>window.location.href,()=>window.location.href);
  export const useSearchParams=()=>new URL(useHref()).searchParams;
  export const usePathname=()=>new URL(useHref()).pathname;
  export const useRouter=()=>({replace(href){history.replaceState(null,'',href)},refresh(){}});`;
const result = await build({
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{DiscoverView}from'./features/discover/components/discover-view';
    import{AppShell}from'./components/app-shell';
    import{DEFAULT_USER_PREFERENCES}from'./features/preferences/defaults';
    import{parseDiscoverState}from'./features/discover/state';
    import{useHref}from'next/navigation';
    import{TMDB_ATTRIBUTION}from'./lib/tmdb/attribution';
    history.replaceState({__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:[]},'',location.href);
    for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(data,unused,url)=>{if(data?.__NA||data?._N){original(data,unused,url);return;}original({...data,__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE},unused,url);window.dispatchEvent(new PopStateEvent('popstate'));}}
    const titles=['Breaking Bad','Dark','Severance','Silo','The Office','Fallout','Gravity Falls','A Very Long Television Series Title That Must Fit Without Breaking the Grid','The Last of Us','Lost','Sherlock','Arcane','Friends','Succession','The Bear','Andor','The Expanse','The Good Place','Better Call Saul','Community'];
    const posters=['/3xnWaLQjelJDDF7LT1WBo6f4BRe.jpg','/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg',null];
    const shows=titles.map((title,i)=>({tmdbId:i+1,title,posterPath:posters[i%3],firstAirDate:i%4?'2022-02-03':null,originalLanguage:'en',overview:i%3?'A carefully observed story of people whose lives intersect in unexpected ways. '.repeat(5):null,backdropPath:null,genreIds:[],originCountries:[],originalTitle:title,popularity:null,voteAverage:i%4?8.237:null,voteCount:i%4?1200:0}));
    window.qa={calls:[],added:new Set([1,2,3]),mode:'permanent',hide:false,fail:false,slow:false,expired:false,limited:false,stale:false,finish:null};
    function envelope(state){const page=state.q?state.searchPage:state.page;const results=state.q?shows.filter(s=>s.title.toLowerCase().includes(state.q.toLowerCase())):page===1?shows:[...shows].reverse();return {attribution:TMDB_ATTRIBUTION,page,results,totalPages:state.q?2:10,totalResults:200,...(!state.q?{feed:window.qa.mode==='demo'?'demo':state.feed,source:window.qa.mode==='demo'?'demo':'tmdb',fetchedAt:window.qa.mode==='demo'?null:new Date(Date.now()-(window.qa.stale?7:0)*3600000).toISOString(),freshness:window.qa.mode==='demo'?'local':window.qa.stale?'stale':'fresh',pagination:{supported:window.qa.mode!=='demo',cap:window.qa.mode==='demo'?1:10,next:page<10,previous:page>1}}:{})};}
    window.qa.add=id=>{window.qa.calls.push({kind:'add',id});return new Promise(resolve=>{window.qa.finish=outcome=>{if(outcome.status!=='error')window.qa.added.add(id);resolve(outcome)};if(window.qa.auto)setTimeout(()=>window.qa.finish({status:'success',message:'Show added to your library.'}),600)});};
    window.fetch=async(url,{signal}={})=>{window.qa.calls.push({kind:'listing',url:String(url)});if(window.qa.slow)await new Promise(r=>setTimeout(r,1800));if(signal?.aborted)throw new DOMException('Aborted','AbortError');if(window.qa.expired)return new Response(null,{status:401});if(window.qa.limited)return new Response(null,{status:429,headers:{'Retry-After':'2'}});if(window.qa.fail)return new Response(null,{status:503});const p=new URL(String(url),location.origin).searchParams;return Response.json(envelope({feed:p.get('feed')||'trending',page:Number(p.get('page')||1),q:p.get('query')||'',searchPage:Number(p.get('page')||1)}));};
    const initialState=parseDiscoverState(new URLSearchParams(location.search));
    const initialListing=Promise.resolve({data:envelope(initialState)});
    function App(){
      const href=useHref();const[version,setVersion]=useState(0);const[report,setReport]=useState('[]');const path=new URL(href).pathname;
      return <><AppShell userEmail={window.qa.mode==='demo'?'Guest demo':'QA permanent account'}>
        {path.startsWith('/shows/')?<section><h1>Show Detail fixture</h1><a className="title-link" href="/discover" onClick={e=>{e.preventDefault();history.back()}}>Return to results</a></section>:
          path==='/sign-in'?<h1>Sign in</h1>:<DiscoverView key={version} accountScope={window.qa.mode+version} demo={window.qa.mode==='demo'} initialState={initialState} initialListing={initialListing} initialAddedShowIds={[...window.qa.added]} preferences={{...DEFAULT_USER_PREFERENCES,hideAdded:window.qa.hide}}/>}
        </AppShell><aside aria-label="QA controls" style={{position:'fixed',right:8,bottom:100,zIndex:9999,maxWidth:240,maxHeight:'75vh',overflow:'auto',background:'white',color:'black',padding:8,border:'1px solid #aaa',fontSize:12}}>
          <details><summary>QA controls</summary>
          {['Demo mode','Permanent mode','Hide added','Fail listings','Slow listings','Expire session','Rate limit','Stale feed','Dark theme','Zoom 200%'].map((label,i)=><button className="block min-h-11" key={label} onClick={()=>{
            if(i===0)window.qa.mode='demo';if(i===1)window.qa.mode='permanent';if(i===2)window.qa.hide=!window.qa.hide;if(i===3)window.qa.fail=!window.qa.fail;if(i===4)window.qa.slow=!window.qa.slow;if(i===5)window.qa.expired=true;if(i===6)window.qa.limited=!window.qa.limited;if(i===7)window.qa.stale=!window.qa.stale;if(i===8)document.documentElement.classList.toggle('dark');if(i===9)document.documentElement.style.zoom=document.documentElement.style.zoom?'':'2';if(i<3)setVersion(v=>v+1)
          }}>{label}</button>)}
          <button className="block min-h-11" onClick={()=>window.qa.finish?.({status:'success',message:'Show added to your library.'})}>Finish Add</button>
          <button className="block min-h-11" onClick={()=>window.qa.finish?.({status:'duplicate',message:'Already in your library.'})}>Duplicate Add</button>
          <button className="block min-h-11" onClick={()=>window.qa.finish?.({status:'error',message:'Unable to add this show right now.'})}>Fail Add</button>
          <button className="block min-h-11" onClick={()=>window.qa.auto=true}>Auto Add success</button>
          <button className="block min-h-11" onClick={()=>setReport(JSON.stringify(window.qa.calls))}>Show request report</button>
          <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{report}</pre></details>
        </aside></>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "fixture", setup(bundler) {
    bundler.onResolve({ filter: /^next\/(navigation|link|image)$|^@\/features\/(search|auth)\/actions$/ }, ({ path: name }) => ({ path: name, namespace: "fixture" }));
    bundler.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({ loader: "jsx", resolveDir: root, contents:
      name === "next/navigation" ? navigation : name === "next/image" ? `import React from'react';export default function Image({priority,fill,...props}){return <img {...props}/>}` :
      name === "next/link" ? `import React from'react';export default function Link({prefetch,children,...props}){return <a {...props} onClick={e=>{if(!e.ctrlKey&&!e.metaKey){e.preventDefault();history.pushState(null,'',props.href);window.scrollTo(0,0)}}}>{children}</a>}` :
      `export const addShowToLibraryAction=id=>window.qa.add(id);export const signOutAction=async()=>{};` }));
  } }],
});
const cssDir = path.join(root, ".next/static/css");
const css = (await Promise.all((await readdir(cssDir)).filter((name) => name.endsWith(".css")).map((name) => readFile(path.join(cssDir, name), "utf8")))).join("\n");
const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Discover QA fixture</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/app.js") { response.setHeader("Content-Type", "application/javascript"); response.end(result.outputFiles[0].contents); }
  else if (request.url === "/app.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
  else if (request.url === "/brand/episodic-logo.svg" || request.url === "/tmdb-logo.svg") {
    response.setHeader("Content-Type", "image/svg+xml");
    readFile(path.join(root, "public", request.url)).then((data) => response.end(data));
  } else { response.setHeader("Content-Type", "text/html"); response.end(html); }
});
server.listen(0, "127.0.0.1", () => console.info(`Discover fixture: http://127.0.0.1:${server.address().port}/discover`));
process.on("SIGINT", () => server.close());
