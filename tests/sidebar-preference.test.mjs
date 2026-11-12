import assert from 'node:assert/strict';
import {test} from 'node:test';
const load = name => import('../apps/web/lib/sidebar-preference.mjs?'+name);
function browser(saved, mobile=false, blocked=false) {
 const values=new Map(saved ? [['imajilearn:sidebar', saved]] : []);
 return {localStorage:{getItem:k=>{if(blocked)throw Error('blocked');return values.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('blocked');values.set(k,v);}},matchMedia:()=>({matches:mobile})};
}
test('sidebar stays collapsed across subscriptions and actions until explicitly toggled',async()=>{
 const previous=globalThis.window;globalThis.window=browser();
 try{
 const store=await load('navigation');assert.equal(store.sidebarServerSnapshot(),false);assert.equal(store.sidebarSnapshot(),false);
 let updates=0;const unsubscribe=store.subscribeSidebar(()=>updates++);
 store.toggleSidebar();assert.equal(store.sidebarSnapshot(),true);assert.equal(updates,1);unsubscribe();
 const afterNavigation=store.subscribeSidebar(()=>updates++);
 assert.equal(store.sidebarSnapshot(),true);assert.equal(globalThis.window.localStorage.getItem('imajilearn:sidebar'),'collapsed');
 store.setSidebarCollapsed(true);assert.equal(store.sidebarSnapshot(),true);
 store.toggleSidebar();assert.equal(store.sidebarSnapshot(),false);afterNavigation();
 }finally{globalThis.window=previous;}
});
test('saved preference survives reload and viewport changes',async()=>{
 const previous=globalThis.window;
 try{globalThis.window=browser('collapsed');assert.equal((await load('reload')).sidebarSnapshot(),true);
 globalThis.window=browser('expanded',true);assert.equal((await load('mobile-expanded')).sidebarSnapshot(),false);
 globalThis.window=browser(null,true);assert.equal((await load('mobile-default')).sidebarSnapshot(),true);
 }finally{globalThis.window=previous;}
});
test('blocked storage still preserves the preference during navigation',async()=>{
 const previous=globalThis.window;globalThis.window=browser(null,false,true);
 try{const store=await load('blocked');store.toggleSidebar();assert.equal(store.sidebarSnapshot(),true);store.toggleSidebar();assert.equal(store.sidebarSnapshot(),false);}
 finally{globalThis.window=previous;}
});
