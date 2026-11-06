import { useEffect, useRef, useState } from 'react';
import { Copy, KeyRound, Loader2, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api } from '@/api';
import { writeClipboard } from '@/lib/desktop';

export function SignIn({ status, onSignedIn }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [device, setDevice] = useState(null);
  const timer = useRef(null);
  const displayError = error || status?.error;

  useEffect(() => () => clearInterval(timer.current), []);

  async function signInWithCli() {
    setBusy('cli');
    setError(null);
    try {
      await api.signInCli();
      onSignedIn();
    } catch (e) {
      setError(`${e.message} Run "az login" in a terminal, then try again.`);
    } finally {
      setBusy(null);
    }
  }

  async function signInWithDevice() {
    setBusy('device');
    setError(null);
    try {
      const d = await api.startDevice();
      setDevice(d);
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        let s;
        try {
          s = await api.pollDevice();
        } catch (e) {
          clearInterval(timer.current);
          setError(e.message);
          setBusy(null);
          return;
        }
        setDevice(s);
        if (s.status === 'done') {
          clearInterval(timer.current);
          onSignedIn();
        } else if (s.status === 'error') {
          clearInterval(timer.current);
          setError(s.error);
          setBusy(null);
        }
      }, 3000);
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center px-6">
      <section className="w-full max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Tickets planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to <span className="text-foreground">{status?.org?.replace('https://', '') || 'Azure DevOps'}</span>. Tokens stay in the
          app process; nothing is stored on disk.
        </p>

        <div className="mt-6 grid gap-2">
          <Button size="lg" onClick={signInWithCli} disabled={!!busy} className="justify-start">
            {busy === 'cli' ? <Loader2 className="animate-spin" /> : <Terminal />}
            {busy === 'cli' ? 'Acquiring Azure CLI token…' : 'Use my Azure CLI login'}
          </Button>
          <Button size="lg" variant="outline" onClick={signInWithDevice} disabled={!!busy} className="justify-start">
            {busy === 'device' ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {busy === 'device' ? 'Requesting device code…' : 'Sign in with a device code'}
          </Button>
        </div>

        {device?.userCode && device.status === 'pending' && (
          <div className="mt-5 rounded-md border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Open{' '}
              <a className="text-primary underline-offset-4 hover:underline" href={device.verificationUri} target="_blank" rel="noreferrer">
                {device.verificationUri}
              </a>{' '}
              and enter:
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-muted px-3 py-1.5 font-mono text-lg tracking-[0.2em]">{device.userCode}</code>
              <Button size="icon-sm" variant="ghost" aria-label="Copy code" onClick={() => writeClipboard(device.userCode).catch(
                (e) => setError(`Could not copy the code: ${e.message || e}`),
              )}>
                <Copy />
              </Button>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Waiting for you to finish in the browser…
            </p>
          </div>
        )}

        {displayError && (
          <Alert variant="destructive" className="mt-5">
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription className="break-words whitespace-pre-wrap">{displayError}</AlertDescription>
          </Alert>
        )}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Both options use the Azure CLI's public client, so no app registration is needed. The device code flow defaults to your work
          tenant; set <code className="font-mono">AZURE_TENANT_ID</code> to pin one.
        </p>
      </section>
    </main>
  );
}
