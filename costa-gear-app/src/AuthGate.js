import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./auth.css";

const palette = {
  ink: "#20251F",
  olive: "#858C38",
  muted: "#647062",
  bg: "#F3F4EF",
  line: "rgba(50,56,42,0.13)",
  red: "#B65145",
  green: "#4D7D57",
};

const font = 'Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const fieldStyle = { width:"100%", boxSizing:"border-box", border:`1px solid ${palette.line}`, borderRadius:9, padding:"11px 12px", fontSize:14, outline:"none", fontFamily:font };

function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "activate") {
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        const { data, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        if (data?.session) {
          onAuthenticated(data.session);
        } else {
          setNotice("Account created. Check your email for the confirmation link, then return here and sign in.");
          setMode("signin");
          setPassword("");
          setConfirmPassword("");
        }
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data?.session) onAuthenticated(data.session);
    } catch (err) { setError(err?.message || "Authentication failed."); }
    finally { setBusy(false); }
  };

  return <div style={{minHeight:"100vh",background:"linear-gradient(180deg,#080907 0 38%,#F3F4EF 38%)",display:"grid",placeItems:"center",padding:24,fontFamily:font}}>
    <div style={{width:"100%",maxWidth:420,background:"#fff",borderRadius:18,padding:28,border:`1px solid ${palette.line}`,boxShadow:"0 26px 80px rgba(18,22,15,.20)"}}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:20}}><img src="/costa-gear-logo-login.svg" alt="Costa Gear Off-Road Accessories" style={{width:225,maxWidth:"78%",height:"auto",display:"block"}}/></div>
      <h1 style={{margin:0,color:palette.ink,fontSize:25,letterSpacing:"-.03em",fontWeight:800}}>Operations Portal</h1>
      <p style={{color:palette.muted,fontSize:13,lineHeight:1.55,margin:"8px 0 18px"}}>
        {mode === "signin" ? "Sign in with an authorized Costa Gear account." : "Activate an email address that has already been invited by the Costa Gear administrator."}
      </p>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,padding:4,background:palette.bg,borderRadius:10,marginBottom:16}}>
        <button type="button" onClick={()=>{setMode("signin");setError("");setNotice("");}} style={{border:0,borderRadius:8,padding:"8px 10px",fontWeight:800,fontSize:12,cursor:"pointer",background:mode==="signin"?"#fff":"transparent",color:palette.ink,boxShadow:mode==="signin"?"0 2px 8px rgba(0,0,0,.06)":"none"}}>Sign in</button>
        <button type="button" onClick={()=>{setMode("activate");setError("");setNotice("");}} style={{border:0,borderRadius:8,padding:"8px 10px",fontWeight:800,fontSize:12,cursor:"pointer",background:mode==="activate"?"#fff":"transparent",color:palette.ink,boxShadow:mode==="activate"?"0 2px 8px rgba(0,0,0,.06)":"none"}}>Activate invited account</button>
      </div>

      <form onSubmit={submit} style={{display:"grid",gap:13}}>
        <label style={{display:"grid",gap:5,fontSize:12,color:palette.muted,fontWeight:700}}>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={fieldStyle}/></label>
        <label style={{display:"grid",gap:5,fontSize:12,color:palette.muted,fontWeight:700}}>Password<input type="password" required minLength={8} autoComplete={mode==="signin"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} style={fieldStyle}/></label>
        {mode === "activate" ? <label style={{display:"grid",gap:5,fontSize:12,color:palette.muted,fontWeight:700}}>Confirm Password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={fieldStyle}/></label> : null}
        {error&&<div style={{color:palette.red,background:"#FFF4F2",borderRadius:9,padding:10,fontSize:12}}>{error}</div>}
        {notice&&<div style={{color:palette.green,background:"#F1F7F2",borderRadius:9,padding:10,fontSize:12}}>{notice}</div>}
        <button disabled={busy} type="submit" style={{border:0,borderRadius:9,minHeight:42,padding:"10px 14px",background:"linear-gradient(180deg,#929A44,#747B31)",color:"white",fontSize:13,fontWeight:800,cursor:busy?"wait":"pointer",opacity:busy ? .65 : 1}}>{busy?"Working...":mode==="signin"?"Sign in":"Activate account"}</button>
      </form>
      <div style={{marginTop:14,color:palette.muted,fontSize:11.5,lineHeight:1.5,textAlign:"center"}}>Access remains invite-only. Unapproved email addresses cannot create an account.</div>
    </div>
  </div>;
}

function AccessPending({ user }) {
  return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:palette.bg,padding:24,fontFamily:font}}>
    <div style={{maxWidth:520,background:"white",borderRadius:16,padding:28,border:`1px solid ${palette.line}`,boxShadow:"0 18px 45px rgba(28,39,24,.08)"}}>
      <h2 style={{marginTop:0,color:palette.ink}}>Access not approved</h2>
      <p style={{color:palette.muted,lineHeight:1.55}}>The account <strong>{user?.email}</strong> is authenticated but is not an approved Costa Gear Operations member.</p>
      <button onClick={()=>supabase.auth.signOut()} style={{border:`1px solid ${palette.line}`,borderRadius:9,padding:"9px 12px",background:"white",cursor:"pointer",fontWeight:700}}>Sign out</button>
    </div>
  </div>;
}

export default function AuthGate({ children }) {
  const [session,setSession]=useState(null),[membership,setMembership]=useState(null),[loading,setLoading]=useState(true);
  const sessionRef=useRef(null);
  const membershipRef=useRef(null);

  const applyMembership = data => {
    membershipRef.current=data||null;
    setMembership(data||null);
    setLoading(false);
  };

  const checkMembership = async currentSession => {
    if (!currentSession?.user) { applyMembership(null); return; }
    const { data } = await supabase.from("app_members").select("role").eq("user_id",currentSession.user.id).maybeSingle();
    applyMembership(data);
  };

  useEffect(()=>{
    let active=true;
    supabase.auth.getSession().then(({data})=>{
      if(!active)return;
      const current=data?.session||null;
      sessionRef.current=current;
      setSession(current);
      checkMembership(current);
    });

    const {data:listener}=supabase.auth.onAuthStateChange((event,nextSession)=>{
      if(!active)return;
      const previousUserId=sessionRef.current?.user?.id||null;
      const nextUserId=nextSession?.user?.id||null;
      const sameAuthorizedUser=Boolean(nextUserId && previousUserId===nextUserId && membershipRef.current);

      sessionRef.current=nextSession;
      setSession(nextSession);

      if(!nextSession){ applyMembership(null); return; }
      if(event==="TOKEN_REFRESHED" && sameAuthorizedUser) return;
      if(sameAuthorizedUser){ setTimeout(()=>{ if(active) checkMembership(nextSession); },0); return; }

      setLoading(true);
      setTimeout(()=>{ if(active) checkMembership(nextSession); },0);
    });

    return()=>{active=false;listener?.subscription?.unsubscribe();};
  },[]);

  if(loading)return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:font,color:palette.muted,background:palette.bg}}>Loading Costa Gear...</div>;
  if(!session)return <LoginScreen onAuthenticated={nextSession=>{sessionRef.current=nextSession;setSession(nextSession);setLoading(true);checkMembership(nextSession);}}/>;
  if(!membership)return <AccessPending user={session.user}/>;

  return <>
    <div className="cg-account-control">
      <span>{session.user.email}</span>
      <button onClick={()=>supabase.auth.signOut()}>Sign out</button>
    </div>
    {children}
  </>;
}
