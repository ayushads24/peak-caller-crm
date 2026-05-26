import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({ component: Page });

function Page() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 shadow-card">
        <h2 className="font-display text-2xl font-semibold">Forgot password</h2>
        <p className="text-sm text-muted-foreground mt-1">We'll email you a reset link.</p>
        {sent ? (
          <div className="mt-6 p-4 rounded-lg bg-secondary text-sm">If an account exists for <strong>{email}</strong>, a reset link is on its way.</div>
        ) : (
          <form onSubmit={handle} className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <Button type="submit" className="w-full bg-gradient-primary" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin mr-2" />}Send reset link
            </Button>
          </form>
        )}
        <p className="text-sm text-center mt-6 text-muted-foreground"><Link to="/login" className="text-primary hover:underline">Back to sign in</Link></p>
      </Card>
    </div>
  );
}