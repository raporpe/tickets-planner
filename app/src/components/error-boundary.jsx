import { Component } from 'react';
import { Check, Copy, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { writeClipboard } from '@/lib/desktop';
import pkg from '../../package.json';

function buildDiagnosticReport(error, componentStack) {
  const lines = [
    `### Tickets planner v${pkg.version} — Crash Diagnostic Report`,
    `- **Time**: ${new Date().toISOString()}`,
    `- **Platform**: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
    `- **URL**: ${typeof location !== 'undefined' ? location.href : 'unknown'}`,
    `- **Error**: \`${error?.name || 'Error'}: ${error?.message || String(error)}\``,
    '',
    '#### Stack Trace',
    '```',
    String(error?.stack || error || 'No stack trace available').trim(),
    '```',
  ];
  if (componentStack) {
    lines.push('', '#### React Component Stack', '```', String(componentStack).trim(), '```');
  }
  return lines.join('\n');
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      componentStack: '',
      copied: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[TicketsPlanner Crash]', error, errorInfo);
    this.setState({
      error,
      componentStack: errorInfo?.componentStack || '',
    });
  }

  copyReport = async () => {
    const report = buildDiagnosticReport(this.state.error, this.state.componentStack);
    try {
      await writeClipboard(report);
    } catch {
      try {
        await navigator.clipboard?.writeText(report);
      } catch {
        /* ignore */
      }
    }
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2200);
  };

  resetAndReload = () => {
    try {
      window.localStorage?.removeItem('tickets.mockMode.v1');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    const { error, componentStack, copied } = this.state;
    if (!error) return this.props.children;

    const report = buildDiagnosticReport(error, componentStack);

    return (
      <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
        <section
          role="alert"
          aria-label="Application error"
          className="flex w-full max-w-2xl flex-col gap-4 rounded-xl border border-destructive/40 bg-card p-6 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive"
            >
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-foreground">Tickets planner ran into a critical error</h1>
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                  v{pkg.version}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Copy the diagnostic report below and send it to <strong className="font-medium text-foreground">raulpo@microsoft.com</strong> on Teams so we can fix it right away.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 font-mono text-xs font-medium break-words text-destructive">
            {error?.name || 'Error'}: {error?.message || String(error)}
          </div>

          <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/85 select-all">
            {report}
          </pre>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={this.resetAndReload}>
              <RotateCcw className="size-3.5" />
              Reload app
            </Button>
            <Button size="sm" onClick={this.copyReport}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied diagnostic report' : 'Copy diagnostic report'}
            </Button>
          </div>
        </section>
      </main>
    );
  }
}
