import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const palette = {
  ink: "#20251F",
  olive: "#858C38",
  green: "#4D7D57",
  muted: "#647062",
  bg: "#F3F4EF",
  line: "rgba(50,56,42,0.13)",
  red: "#B65145",
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${palette.line}`,
  borderRadius: 12,
  padding: "12px 13px",
  fontSize: 15,
  outline: "none",
  fontFamily: "inherit",
};

function LoginScreen({ onAuthenticated }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data?.session) onAuthenticated(data.session);
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#070807 0 42%,#F3F4EF 42%)", display: "grid", placeItems: "center", padding: 24, fontFamily: "Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: 22, padding: 28, border: `1px solid ${palette.line}`, boxShadow: "0 30px 90px rgba(18,22,15,0.20)" }}>
        <div style={{ fontSize: 12, color: palette.olive, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 8 }}>Costa Gear</div>
        <h1 style={{ margin: 0, color: palette.ink, fontSize: 29, letterSpacing: "-0.03em" }}>Sourcing Operations</h1>
        <p style={{ color: palette.muted, fontSize: 14, lineHeight: 1.55, margin: "10px 0 22px" }}>
          Sign in with an authorized Costa Gear account. Access is invite-only.
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 13, color: palette.muted, fontWeight: 700 }}>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
          </label>
          <label style={{ display: "grid", gap: 5, fontSize: 13, color: palette.muted, fontWeight: 700 }}>
            Password
            <input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />
          </label>

          {error && <div style={{ color: palette.red, background: "#FFF4F2", borderRadius: 10, padding: 11, fontSize: 13 }}>{error}</div>}

          <button disabled={busy} type="submit" style={{ border: 0, borderRadius: 12, minHeight: 44, padding: "11px 14px", background: "linear-gradient(180deg,#929A44,#747B31)", color: "white", fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.65 : 1 }}>
            {busy ? "Working..." : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: 14, color: palette.muted, fontSize: 12, lineHeight: 1.5, textAlign: "center" }}>
          Need access? Contact the Costa Gear administrator for an invitation.
        </div>
      </div>
    </div>
  );
}

function AccessPending({ user }) {
  const signOut = async () => { await supabase.auth.signOut(); };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: palette.bg, padding: 24, fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" }}>
      <div style={{ maxWidth: 520, background: "white", borderRadius: 18, padding: 28, border: `1px solid ${palette.line}`, boxShadow: "0 18px 45px rgba(28,39,24,0.08)" }}>
        <h2 style={{ marginTop: 0, color: palette.ink }}>Access not approved</h2>
        <p style={{ color: palette.muted, lineHeight: 1.55 }}>The account <strong>{user?.email}</strong> is authenticated but is not an approved Costa Gear Sourcing member.</p>
        <button onClick={signOut} style={{ border: `1px solid ${palette.line}`, borderRadius: 10, padding: "9px 12px", background: "white", cursor: "pointer", fontWeight: 700 }}>Sign out</button>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkMembership = async (currentSession) => {
    if (!currentSession?.user) {
      setMembership(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("app_members")
      .select("role")
      .eq("user_id", currentSession.user.id)
      .maybeSingle();
    setMembership(data || null);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const current = data?.session || null;
      setSession(current);
      checkMembership(current);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(true);
      setTimeout(() => checkMembership(nextSession), 0);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui,sans-serif", color: palette.muted, background: palette.bg }}>Loading Costa Gear...</div>;
  }

  if (!session) return <LoginScreen onAuthenticated={(nextSession) => { setSession(nextSession); setLoading(true); checkMembership(nextSession); }} />;
  if (!membership) return <AccessPending user={session.user} />;

  return (
    <>
      <div style={{ position: "fixed", top: 12, right: 16, zIndex: 90, display: "flex", alignItems: "center", gap: 9, fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" }}>
        <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>{session.user.email}</span>
        <button onClick={() => supabase.auth.signOut()} style={{ border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "white", borderRadius: 9, padding: "7px 9px", cursor: "pointer", fontSize: 12 }}>Sign out</button>
      </div>
      {children}
    </>
  );
}
