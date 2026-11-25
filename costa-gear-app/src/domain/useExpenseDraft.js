import { useContext, useLayoutEffect, useRef, useState } from "react";
import { AccountContext } from "../AuthGate";
const pendingFiles = new Map();
const draftKey = (userId,year) => userId ? "cg:expense-draft:v1:"+userId+":"+year : null;
export function readExpenseDraft(userId,year) {
  const key=draftKey(userId,year);
  if(!key) return null;
  try { const saved=JSON.parse(sessionStorage.getItem(key)||"null"); return saved && saved.form && !saved.form.id ? saved : null; } catch (_) { return null; }
}
export function useExpenseDraft(initial, year, enabled=true) {
  const userId=useContext(AccountContext);
  const key=enabled ? draftKey(userId,year) : null;
  const [restored]=useState(()=>key ? readExpenseDraft(userId,year):null);
  const baseline=useRef(initial);
  const [form,setForm]=useState(()=>({...initial,...(restored?.form||{})}));
  const [file,setFileState]=useState(()=>key ? pendingFiles.get(key)||null : null);
  const [fileName,setFileName]=useState(()=>restored?.fileName||"");
  const [storageError,setStorageError]=useState(false);
  const dirty=JSON.stringify(form)!==JSON.stringify(baseline.current) || Boolean(fileName);
  const cleared=useRef(false);
  const setFile=next=>{
    setFileState(next);setFileName(next?.name||"");
    if(key){if(next)pendingFiles.set(key,next);else pendingFiles.delete(key);}
  };
  useLayoutEffect(()=>{
    if(!key) return;
    try{
      if(cleared.current){cleared.current=false;return;}
      if(dirty)sessionStorage.setItem(key,JSON.stringify({form,fileName}));
      else sessionStorage.removeItem(key);
      setStorageError(false);
    }catch(_){setStorageError(true);}
  },[key,form,fileName,dirty]);
  const clearDraft=()=>{
    if(!key)return;
    cleared.current=true;
    pendingFiles.delete(key);
    try{sessionStorage.removeItem(key);}catch(_){}
  };
  const discard=()=>{
    clearDraft();setForm({...baseline.current});setFile(null);
  };
  return {form,setForm,file,setFile,dirty,storageError,missingFile:fileName&&!file?fileName:"",clearDraft,discard};
}
