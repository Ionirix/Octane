import{e as l,i as s,j as e,c as g}from"./index-CT5gUK6n.js";/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=l("ChevronDown",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]);/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=l("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=l("Terminal",[["polyline",{points:"4 17 10 11 4 5",key:"akl6gq"}],["line",{x1:"12",x2:"20",y1:"19",y2:"19",key:"q2wloq"}]]);/**
 * @license lucide-react v0.390.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const D=l("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]),I={info:"text-[var(--muted)]",warn:"text-[#f59e0b]",error:"text-[#ef4444]",cmd:"text-[var(--accent)]",out:"text-[#10b981]",output:"text-[#10b981]",debug:"text-[#a855f7]",input:"text-[var(--accent)]",success:"text-[#10b981]"};function T({lines:o,onCommand:c,defaultOpen:u=!1,title:h="TERMINAL",prompt:m="$",placeholder:v="enter command..."}){const[p,f]=s.useState(u),[r,n]=s.useState(""),[i,b]=s.useState([]),[d,x]=s.useState(-1),y=s.useRef(null),j=s.useRef(null),k=s.useCallback(()=>{r.trim()&&(b(t=>[r,...t].slice(0,50)),x(-1),c==null||c(r.trim()),n(""))},[r,c]),N=t=>{if(t.key==="Enter"){k();return}if(t.key==="ArrowUp"){const a=Math.min(d+1,i.length-1);x(a),n(i[a]||"")}if(t.key==="ArrowDown"){const a=Math.max(d-1,-1);x(a),n(a===-1?"":i[a]||"")}};return e.jsxs("div",{className:"border-t border-[var(--border)] bg-[var(--bg)] shrink-0",children:[e.jsxs("div",{className:"flex items-center justify-between px-3 py-1.5 cursor-pointer select-none",onClick:()=>f(t=>!t),children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(z,{size:10,className:"text-[var(--accent)]"}),e.jsx("span",{className:"text-[9px] tracking-widest uppercase text-[var(--accent)]",children:h}),e.jsxs("span",{className:"text-[9px] text-[var(--border2)]",children:[o.length," lines"]})]}),p?e.jsx(w,{size:10,className:"text-[var(--muted)]"}):e.jsx(R,{size:10,className:"text-[var(--muted)]"})]}),p&&e.jsxs("div",{className:"flex flex-col",style:{height:160},children:[e.jsx("div",{ref:y,className:"flex-1 overflow-y-auto px-3 py-1 font-mono text-[10px] leading-relaxed space-y-0.5",children:o.map(t=>e.jsxs("div",{className:g("flex gap-2",I[t.type]),children:[e.jsx("span",{className:"text-[var(--border2)] shrink-0",children:new Date(t.ts).toLocaleTimeString("en",{hour12:!1})}),e.jsx("span",{className:"break-all",children:t.text})]},t.id))}),e.jsxs("div",{className:"flex items-center gap-2 px-3 py-1.5 border-t border-[var(--border)]",children:[e.jsxs("span",{className:"text-[var(--accent)] text-[10px]",children:[m,"❯"]}),e.jsx("input",{ref:j,value:r,onChange:t=>n(t.target.value),onKeyDown:N,className:"flex-1 bg-transparent text-[10px] text-[var(--text)] outline-none placeholder-[var(--border2)] font-mono",placeholder:v}),e.jsx("button",{onClick:()=>n(""),children:e.jsx(D,{size:10,className:"text-[var(--border2)] hover:text-[var(--muted)]"})})]})]})]})}export{T as O,D as X};
