// Shared browser-only UI enhancements. No changes to AI keys or subtitle data.
const STORE='vietflow.appearance.v1';
const root=document.documentElement;
const current=()=>root.dataset.theme==='dark'?'dark':'light';
function savedTheme(){try{return localStorage.getItem(STORE);}catch{return null;}}
function setTheme(theme){root.dataset.theme=theme;try{localStorage.setItem(STORE,theme);}catch{};syncButtons();}
function svg(name){
  const common='viewBox="0 0 24 24" aria-hidden="true"';
  const paths={
    moon:'<path d="M20.6 14.2A8.5 8.5 0 0 1 9.8 3.4 8.5 8.5 0 1 0 20.6 14.2Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    focus:'<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/>'
  };
  return '<svg '+common+'>'+paths[name]+'</svg>';
}
const holder=document.createElement('div');
holder.className='ui-quicktools';
const theme=document.createElement('button');
theme.type='button';theme.className='ui-tool';
const isVideo=!!document.querySelector('.video-card');
let focus=false;
let focusButton;
function syncButtons(){
  theme.innerHTML=svg(current()==='dark'?'sun':'moon')+'<span>'+(current()==='dark'?'Giao diện sáng':'Giao diện tối')+'</span>';
  theme.setAttribute('aria-label',current()==='dark'?'Bật giao diện sáng':'Bật giao diện tối');
  theme.title=theme.getAttribute('aria-label');
  if(focusButton){focusButton.setAttribute('aria-pressed',String(focus));focusButton.innerHTML=svg('focus')+'<span>'+(focus?'Thoát tập trung':'Tập trung')+'</span>';focusButton.title=focus?'Thoát chế độ tập trung (F)':'Chế độ tập trung (F)';}
}
theme.addEventListener('click',()=>setTheme(current()==='dark'?'light':'dark'));
holder.append(theme);
if(isVideo){
  focusButton=document.createElement('button');focusButton.type='button';focusButton.className='ui-tool';
  focusButton.addEventListener('click',()=>{focus=!focus;document.body.classList.toggle('focus-mode',focus);syncButtons();});
  holder.append(focusButton);
}
const target=isVideo?document.querySelector('.topline'):document.querySelector('main header');
if(target)target.append(holder);else document.body.append(holder);
const preferred=savedTheme();
setTheme(preferred==='light'||preferred==='dark'?preferred:(window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'));
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.altKey||event.shiftKey)return;
  const el=event.target;
  const editing=el instanceof HTMLElement&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName));
  const hasModal=[...document.querySelectorAll('dialog')].some(d=>d.open);
  if(isVideo&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();document.querySelector('#youtubeUrl')?.focus();return;
  }
  if(isVideo&&!editing&&!hasModal&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='f'){
    event.preventDefault();focusButton?.click();
  }
});
