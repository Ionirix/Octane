import{g as l,l as s,k as e,d as N}from"./index-5u4nU5Pd.js";/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=l("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=l("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=l("Terminal",[["polyline",{points:"4 17 10 11 4 5",key:"akl6gq"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19",key:"q2wloq"}]]);/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=l("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]),T={info:"text-[var(--muted)]",warn:"text-[#f59e0b]",error:"text-[#ef4444]",cmd:"text-[var(--accent)]",out:"text-[#10b981]",output:"text-[#10b981]",debug:"text-[#a855f7]",input:"text-[var(--accent)]",success:"text-[#10b981]"};function I(i,a){return{id:`tl-${Date.now()}-${Math.random().toString(36).slice(2)}`,ts:Date.now(),type:i,text:a}}function M({lines:i,onCommand:a,defaultOpen:u=!1,title:m="TERMINAL",prompt:h="$",placeholder:v="enter command..."}){const[d,f]=s.useState(u),[n,c]=s.useState(""),[o,b]=s.useState([]),[p,x]=s.useState(-1),y=s.useRef(null),j=s.useRef(null),k=s.useCallback(()=>{n.trim()&&(b(t=>[n,...t].slice(0,50)),x(-1),a==null||a(n.trim()),c(""))},[n,a]),g=t=>{if(t.key==="Enter"){k();return}if(t.key==="ArrowUp"){const r=Math.min(p+1,o.length-1);x(r),c(o[r]||"")}if(t.key==="ArrowDown"){const r=Math.max(p-1,-1);x(r),c(r===-1?"":o[r]||"")}};return e.jsxs("div",{className:"border-t border-[var(--border)] bg-[var(--bg)] shrink-0",children:[e.jsxs("div",{className:"flex items-center justify-between px-3 py-1.5 cursor-pointer select-none",onClick:()=>f(t=>!t),children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(R,{size:10,className:"text-[var(--accent)]"}),e.jsx("span",{className:"text-[9px] tracking-widest uppercase text-[var(--accent)]",children:m}),e.jsxs("span",{className:"text-[9px] text-[var(--border2)]",children:[i.length," lines"]})]}),d?e.jsx(w,{size:10,className:"text-[var(--muted)]"}):e.jsx(D,{size:10,className:"text-[var(--muted)]"})]}),d&&e.jsxs("div",{className:"flex flex-col",style:{height:160},children:[e.jsx("div",{ref:y,className:"flex-1 overflow-y-auto px-3 py-1 font-mono text-[10px] leading-relaxed space-y-0.5",children:i.map(t=>e.jsxs("div",{className:N("flex gap-2",T[t.type]),children:[e.jsx("span",{className:"text-[var(--border2)] shrink-0",children:new Date(t.ts).toLocaleTimeString("en",{hour12:!1})}),e.jsx("span",{className:"break-all",children:t.text})]},t.id))}),e.jsxs("div",{className:"flex items-center gap-2 px-3 py-1.5 border-t border-[var(--border)]",children:[e.jsxs("span",{className:"text-[var(--accent)] text-[10px]",children:[h,"❯"]}),e.jsx("input",{ref:j,value:n,onChange:t=>c(t.target.value),onKeyDown:g,className:"flex-1 bg-transparent text-[10px] text-[var(--text)] outline-none placeholder-[var(--border2)] font-mono",placeholder:v}),e.jsx("button",{onClick:()=>c(""),children:e.jsx(S,{size:10,className:"text-[var(--border2)] hover:text-[var(--muted)]"})})]})]})]})}export{M as O,S as X,I as m};
