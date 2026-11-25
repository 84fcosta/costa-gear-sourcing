import {useState,useId} from "react";
import {historySuggestions} from "../domain/historySuggestions";
export default function HistoryInput({rows,field,value,onChange,onSelect,preferred,style,required,placeholder,label}) {
  const id=useId(), [open,setOpen]=useState(false), [active,setActive]=useState(-1);
  const options=historySuggestions(rows,field,value,preferred);
  const visible=open && options.length>0;
  const choose=option=>{onChange(option.value);onSelect?.(option.row);setOpen(false);setActive(-1);};
  return <span style={{position:"relative",display:"block",minWidth:0}}>
    <input style={style} required={required} placeholder={placeholder} value={value || ""} autoComplete="off" aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={id} aria-activedescendant={visible && active>=0 ? id+"-"+active : undefined} onFocus={()=>setOpen(true)} onBlur={()=>{setOpen(false);setActive(-1);}} onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1);}} onKeyDown={e=>{
      if(e.key==="Escape"){setOpen(false);setActive(-1);}
      if(e.key==="ArrowDown" && options.length){e.preventDefault();setOpen(true);setActive(i=>(i+1)%options.length);}
      if(e.key==="ArrowUp" && options.length){e.preventDefault();setOpen(true);setActive(i=>i<=0?options.length-1:i-1);}
      if(e.key==="Enter" && visible && active>=0 && options[active]){e.preventDefault();choose(options[active]);}
    }}/>
    {visible && <span id={id} role="listbox" style={{position:"absolute",top:"100%",left:0,right:0,zIndex:30,display:"block",background:"#fff",border:"1px solid #d9ddd4",borderRadius:8,boxShadow:"0 6px 20px #0002",overflow:"hidden"}}>
      {options.map((option,index)=><span key={option.value} id={id+"-"+index} role="option" aria-selected={index===active} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(option)} style={{display:"block",padding:"10px 12px",fontSize:13,fontWeight:500,textTransform:"none",color:"#20251f",background:index===active?"#eef1df":"#fff",cursor:"pointer",overflowWrap:"anywhere",borderBottom:"1px solid #eef0eb"}}>{option.value}</span>)}
    </span>}
  </span>;
}
