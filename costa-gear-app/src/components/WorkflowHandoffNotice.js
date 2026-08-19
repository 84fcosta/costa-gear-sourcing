export default function WorkflowHandoffNotice({ handoff, onDismiss }) {
  if (!handoff) return null;
  const isBuying = handoff.type === "buying-draft-created";
  if (!isBuying) return null;
  return <div style={{background:"#EDF7EE",borderBottom:"1px solid rgba(77,125,87,.22)",padding:"11px 18px",color:"#355C3D"}}>
    <div style={{maxWidth:1560,margin:"0 auto",display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{fontSize:13}}><strong>{handoff.poRef || "Buying Draft"} created from Sourcing.</strong> Review the draft at the top of the Buying Decisions list, adjust quantity or terms, then move it through Planned, Approved and Ordered when ready.</div>
      <button onClick={onDismiss} style={{border:"1px solid rgba(77,125,87,.25)",background:"#fff",color:"#355C3D",borderRadius:8,padding:"6px 9px",fontWeight:750,cursor:"pointer",fontSize:12}}>Dismiss</button>
    </div>
  </div>;
}
