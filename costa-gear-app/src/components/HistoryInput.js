import {useContext,useState,useId,useRef} from "react";
import {AccountContext} from "../AuthGate";
import {historySuggestions,normalizeHistory} from "../domain/historySuggestions";
const readHidden=key=>{try{const values=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(values)?values:[];}catch(_){return [];}};
export default function HistoryInput({rows,field,value,onChange,onSelect,preferred,style,required,placeholder,label}) {
  const account=useContext(AccountContext), inputRef=useRef(null);
  const storageKey=account ? "cg:hidden-suggestions:v1:"+account+":"+field : null;
  const id=useId(), [open,setOpen]=useState(false), [active,setActive]=useState(-1),[hidden,setHidden]=useState(()=>storageKey?readHidden(storageKey):[]);
  const options=historySuggestions(rows,field,value,preferred,hidden);
  const visible=open && (options.length>0 || hidden.length>0);
  const store=next=>{setHidden(next);setActive(-1);if(storageKey){try{localStorage.setItem(storageKey,JSON.stringify(next));}catch(_){}}};
  const hide=option=>store([...new Set([...hidden,normalizeHistory(option.value)])]);
  const choose=option=>{onChange(option.value);onSelect?.(option.row);setOpen(false);setActive(-1);};
  return <span onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setActive(-1);}}} style={{position:"relative",display:"block",minWidth:0}}>
    <input ref={inputRef} style={style} required={required} placeholder={placeholder} value={value || ""} autoComplete="off" aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={id} aria-activedescendant={visible && active>=0 && options[active] ? id+"-"+active : undefined} onFocus={()=>{if(storageKey)setHidden(readHidden(storageKey));setOpen(true);}} onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1);}} onKeyDown={e=>{
      if(e.key==="Escape"){setOpen(false);setActive(-1);}
      if(e.key==="ArrowDown" && options.length){e.preventDefault();setOpen(true);setActive(i=>(i+1)%options.length);}
      if(e.key==="ArrowUp" && options.length){e.preventDefault();setOpen(true);setActive(i=>i<=0?options.length-1:i-1);}
      if(e.key==="Delete" && e.shiftKey && visible && options[active]){e.preventDefault();hide(options[active]);}
      if(e.key==="Enter" && visible && active>=0 && options[active]){e.preventDefault();choose(options[active]);}
    }}/>
    {visible && <span style={{position:"absolute",top:"100%",left:0,right:0,zIndex:30,display:"block",background:"#fff",border:"1px solid #d9ddd4",borderRadius:8,boxShadow:"0 6px 20px #0002",overflow:"hidden"}}>
      <span id={id} role="listbox" style={{display:"block"}}>
      {options.map((option,index)=><span key={option.value} role="presentation" style={{display:"flex",alignItems:"center",gap:4,background:index===active?"#eef1df":"#fff",borderBottom:"1px solid #eef0eb"}}>
        <span id={id+"-"+index} role="option" aria-selected={index===active} onPointerDown={e=>e.preventDefault()} onClick={e=>{e.preventDefault();choose(option);}} style={{flex:1,minWidth:0,padding:"10px 12px",fontSize:13,fontWeight:500,textTransform:"none",color:"#20251f",cursor:"pointer",overflowWrap:"anywhere"}}>{option.value}</span>
        <button type="button" title="Hide suggestion (does not delete records)" aria-label={"Hide suggestion "+option.value} onPointerDown={e=>e.preventDefault()} onClick={e=>{e.preventDefault();e.stopPropagation();inputRef.current?.focus();hide(option);}} style={{flex:"0 0 36px",height:36,border:0,background:"transparent",color:"#68715f",fontSize:19,cursor:"pointer"}}>×</button>
      </span>)}
      </span>
      {hidden.length>0 && <button type="button" onPointerDown={e=>e.preventDefault()} onClick={e=>{e.preventDefault();e.stopPropagation();inputRef.current?.focus();store([]);}} style={{display:"block",width:"100%",border:0,padding:"8px 12px",background:"#f5f7f1",color:"#647062",fontSize:11,textAlign:"left",cursor:"pointer"}}>Restore hidden suggestions ({hidden.length})</button>}
    </span>}
  </span>;
}
