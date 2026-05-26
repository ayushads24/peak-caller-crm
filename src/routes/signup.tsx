import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Zap } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)] relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 70% 30%, var(--primary) 0%, transparent 50%)" }} />
        <div className="relative flex items-center gap-2 font-display text-xl font-semibold">
          <div className="size-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Zap className="size-5 text-white" />
          </div>
          Call to Grow
        </div>
        <div className="relative space-y-4">
          <h1 className="font-display text-4xl font-bold leading-tight">Start closing in minutes.</h1>
          <p className="text-[var(--sidebar-muted)] max-w-md">The first account you create becomes the workspace admin.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <Card className="w-full max-w-md p-8 shadow-card">
          <h2 className="font-display text-2xl font-semibold">Create account</h2>
          <p className="text-sm text-muted-foreground mt-1">Get your sales team online in seconds.</p>
          <form onSubmit={handleSignup} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <Button type="submit" className="w-full bg-gradient-primary shadow-elegant" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin mr-2" />}
              Create account
            </Button>
          </form>
          <p className="text-sm text-center mt-6 text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </Card>
      </div>
    </div>
  );
}